import { randomUUID } from 'node:crypto';
import { parseAmount, formatAmount } from '../../shared/invoices.js';
import { demand, RelayError } from '../errors.js';

const AGENT = 'follow-up-desk';
const DURATION = 30 * 86_400_000;
const MEMO = 'Relay Follow-up Desk / 30-day Testnet access';

export function verifiedAmount(value) {
  demand(typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 999_999_999,
    'PAYMENT_MISMATCH','Pi returned an invalid amount.',409);
  const decimal = value.toFixed(7);
  demand(Number(decimal) === value,'PAYMENT_MISMATCH','The payment amount has unsupported precision.',409);
  return parseAmount(decimal);
}

export function verifyPayment(payment, intent, uid, config, {allowCancelled = false} = {}) {
  demand(payment && payment.user_uid === uid && payment.direction === 'user_to_app' &&
    payment.network === intent.network && intent.network === config.network && payment.to_address === intent.merchant &&
    payment.metadata?.relay_intent === intent.id && payment.metadata?.agent === AGENT &&
    payment.memo === MEMO && verifiedAmount(payment.amount) === String(intent.amount_stroops),
    'PAYMENT_MISMATCH','This payment does not match your Relay purchase.',409);
  demand(payment.status && ['developer_approved','transaction_verified','developer_completed','cancelled','user_cancelled']
    .every(key => typeof payment.status[key] === 'boolean'),
    'PI_RESPONSE_INVALID','Pi returned an invalid payment status.',502);
  demand(allowCancelled || (!payment.status.cancelled && !payment.status.user_cancelled),
    'PAYMENT_CANCELLED','This payment was cancelled. No access was granted.',409);
  return payment;
}

export function createPayments(database, pi, config) {
  function requireCheckout(session) {
    demand(config.checkoutEnabled && config.network === 'Pi Testnet','CHECKOUT_DISABLED','Testnet checkout is not configured.',503);
    demand(session.scopes.includes('payments'),'PAYMENT_PERMISSION_REQUIRED','Sign in with Pi payment permission before checkout.',403);
  }
  async function active(accountId) {
    const result = await database.query(`SELECT id,agent,network,starts_at,expires_at FROM relay_entitlements
      WHERE account_id=$1 AND network=$2 AND expires_at>$3 ORDER BY expires_at DESC`,[accountId,config.network,Date.now()]);
    return result.rows.map(row => ({...row,starts_at:Number(row.starts_at),expires_at:Number(row.expires_at)}));
  }
  async function bind(paymentId, session) {
    const payment = await pi.payment(paymentId);
    demand(payment.identifier === paymentId,'PAYMENT_MISMATCH','Pi returned a different payment.',409);
    const result = await database.query('SELECT * FROM relay_intents WHERE id=$1 AND account_id=$2',
      [payment.metadata?.relay_intent || '',session.account.id]);
    const intent = result.rows[0];
    demand(intent,'INTENT_NOT_FOUND','This purchase intent was not found.',404);
    verifyPayment(payment,intent,session.uid,config,{allowCancelled:true});
    if (payment.status.cancelled || payment.status.user_cancelled) {
      demand(!payment.transaction,'PAYMENT_UNCONFIRMED','A cancelled payment has a transaction and needs reconciliation.',503);
      await database.transaction(async tx => {
        const locked = (await tx.query('SELECT * FROM relay_intents WHERE id=$1 FOR UPDATE',[intent.id])).rows[0];
        if (locked.payment_id === null || locked.payment_id === paymentId) {
          await tx.query("UPDATE relay_intents SET state='cancelled' WHERE id=$1 AND state IN ('open','approved')",[intent.id]);
          await tx.query("UPDATE relay_payments SET state='cancelled' WHERE id=$1 AND state IN ('pending','approved')",[paymentId]);
        }
      });
      throw new RelayError('PAYMENT_CANCELLED','Pi confirmed this payment was cancelled. No access was granted.',409);
    }
    await database.transaction(async tx => {
      const locked = (await tx.query('SELECT * FROM relay_intents WHERE id=$1 FOR UPDATE',[intent.id])).rows[0];
      demand(locked.state !== 'cancelled','INTENT_CLOSED','This purchase intent is closed.',409);
      demand(locked.payment_id === null || locked.payment_id === paymentId,'PAYMENT_ALREADY_BOUND',
        'Another payment is already attached to this purchase. Recover that payment first.',409);
      demand(locked.payment_id || Number(locked.expires_at)>Date.now(),'INTENT_EXPIRED','This purchase intent has expired.',409);
      await tx.query(`INSERT INTO relay_payments(id,intent_id,state,network) VALUES($1,$2,'pending',$3)
        ON CONFLICT(id) DO NOTHING`,[paymentId,intent.id,intent.network]);
      const record = (await tx.query('SELECT intent_id FROM relay_payments WHERE id=$1',[paymentId])).rows[0];
      demand(record.intent_id === intent.id,'PAYMENT_ALREADY_BOUND','This payment belongs to another purchase.',409);
      await tx.query('UPDATE relay_intents SET payment_id=$1 WHERE id=$2',[paymentId,intent.id]);
    });
    return {payment,intent};
  }
  async function settle(paymentId, intent, payment, session) {
    verifyPayment(payment,intent,session.uid,config);
    demand(payment.identifier === paymentId && payment.status.developer_approved && payment.status.developer_completed &&
      payment.status.transaction_verified && payment.transaction?.verified === true &&
      /^[a-f0-9]{64}$/i.test(payment.transaction.txid),
      'PAYMENT_UNCONFIRMED','Pi has not confirmed a completed blockchain payment. Check it again.',503);
    return database.transaction(async tx => {
      await tx.query('SELECT id FROM relay_accounts WHERE id=$1 FOR UPDATE',[session.account.id]);
      const locked = (await tx.query('SELECT * FROM relay_intents WHERE id=$1 FOR UPDATE',[intent.id])).rows[0];
      demand(locked.payment_id === paymentId && locked.state !== 'cancelled','PAYMENT_MISMATCH','This purchase changed during confirmation.',409);
      const existing = await tx.query('SELECT * FROM relay_entitlements WHERE payment_id=$1',[paymentId]);
      if (existing.rows.length) return existing.rows[0];
      const now = Date.now();
      await tx.query("UPDATE relay_payments SET state='completed',txid=$1,completed_at=$2 WHERE id=$3",
        [payment.transaction.txid.toLowerCase(),now,paymentId]);
      await tx.query("UPDATE relay_intents SET state='completed' WHERE id=$1",[intent.id]);
      return (await tx.query(`INSERT INTO relay_entitlements(id,account_id,payment_id,agent,network,starts_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[randomUUID(),session.account.id,paymentId,AGENT,intent.network,now,now+DURATION])).rows[0];
    });
  }
  return {
    active,
    async intent(session) {
      requireCheckout(session);
      return database.transaction(async tx => {
        await tx.query('SELECT id FROM relay_accounts WHERE id=$1 FOR UPDATE',[session.account.id]);
        const current = await tx.query('SELECT id FROM relay_entitlements WHERE account_id=$1 AND network=$2 AND expires_at>$3',
          [session.account.id,config.network,Date.now()]);
        demand(current.rows.length === 0,'ALREADY_ACTIVE','You already have a current Testnet access record.',409);
        const existing = (await tx.query("SELECT * FROM relay_intents WHERE account_id=$1 AND agent=$2 AND network=$3 AND state IN ('open','approved')",
          [session.account.id,AGENT,config.network])).rows[0];
        if (existing?.payment_id) throw new RelayError('PAYMENT_PENDING','Recover the existing payment before starting another purchase.',409);
        let row = existing;
        if (row && Number(row.expires_at)<=Date.now()) {
          await tx.query("UPDATE relay_intents SET state='cancelled' WHERE id=$1",[row.id]);
          row = null;
        }
        if (!row) row = (await tx.query(`INSERT INTO relay_intents(id,account_id,agent,network,merchant,amount_stroops,state,created_at,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,'open',$7,$8) RETURNING *`,
          [randomUUID(),session.account.id,AGENT,config.network,config.merchant,config.price,Date.now(),Date.now()+86_400_000])).rows[0];
        return {id:row.id,amount:Number(formatAmount(row.amount_stroops)),memo:MEMO,
          metadata:{relay_intent:row.id,agent:AGENT}};
      });
    },
    async approve(paymentId, session) {
      requireCheckout(session);
      const {payment,intent} = await bind(paymentId,session);
      demand(payment.identifier === paymentId,'PAYMENT_MISMATCH','Pi returned a different payment.',409);
      const approved = payment.status.developer_approved ? payment : await pi.approve(paymentId);
      verifyPayment(approved,intent,session.uid,config);
      demand(approved.identifier === paymentId && approved.status.developer_approved,'PAYMENT_UNCONFIRMED','Pi has not approved this payment.',503);
      await database.transaction(async tx => {
        await tx.query("UPDATE relay_payments SET state='approved' WHERE id=$1 AND state='pending'",[paymentId]);
        await tx.query("UPDATE relay_intents SET state='approved' WHERE id=$1 AND state='open'",[intent.id]);
      });
      return {paymentId,state:approved.status.developer_completed?'completed':'approved'};
    },
    async complete(paymentId, txid, session) {
      requireCheckout(session);
      demand(typeof txid === 'string' && /^[a-f0-9]{64}$/i.test(txid),'BAD_TXID','Use a valid transaction hash.');
      const {payment,intent} = await bind(paymentId,session);
      if (payment.transaction?.txid) demand(payment.transaction.txid.toLowerCase() === txid.toLowerCase(),
        'PAYMENT_MISMATCH','This transaction belongs to a different payment.',409);
      const completed = payment.status.developer_completed ? payment : await pi.complete(paymentId,txid);
      demand(completed.transaction?.txid?.toLowerCase() === txid.toLowerCase(),
        'PAYMENT_MISMATCH','Pi confirmed a different transaction.',409);
      const entitlement = await settle(paymentId,intent,completed,session);
      return {entitlement:{...entitlement,starts_at:Number(entitlement.starts_at),expires_at:Number(entitlement.expires_at)}};
    },
    async recover(paymentId, session) {
      requireCheckout(session);
      const {payment} = await bind(paymentId,session);
      demand(payment.transaction?.txid,'PAYMENT_PENDING','This payment has no submitted transaction yet.',409);
      return this.complete(paymentId,payment.transaction.txid,session);
    }
  };
}
