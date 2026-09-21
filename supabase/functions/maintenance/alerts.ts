/// <reference lib="deno.ns" />

import {
  type Row,
  type MaintenanceDependencies,
  database,
  billingAlertReceiver,
  jsonBody,
  billingContext,
  withJobRole,
  errorCode,
  response,
  alertThresholds,
} from './core.ts';

type BillingAlertEvaluation = {
  readonly observedCount: number;
  readonly activeCount: number;
  readonly recoveredCount: number;
  readonly deliveredCount: number;
  readonly pendingDeliveryCount: number;
  readonly receiverStatus: 'delivered' | 'not_configured' | 'failed';
  readonly receiverFailures: readonly string[];
  readonly alerts: readonly Row[];
};

export async function evaluateBillingAlerts(
  input: Record<string, unknown>,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<BillingAlertEvaluation> {
  if (Object.keys(input).some((key) => key !== 'thresholds'))
    throw new Error('INVALID_INPUT');
  const requestedThresholds = alertThresholds(input.thresholds);
  const thresholds = {
    ...(dependencies.billingAlertThresholds ?? {}),
    ...requestedThresholds,
  };
  alertThresholds(thresholds);
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = billingContext(workerId, id, crypto.randomUUID(), 1);
  const rows = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_alerts_evaluate(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::jsonb)',
      [...jobContext, transaction.json(thresholds)],
    ),
  );
  const receiver = dependencies.billingAlertReceiver ?? billingAlertReceiver();
  const receiverFailures: string[] = [];
  let deliveredCount = 0;
  for (const alert of rows) {
    if (alert.needs_delivery !== true || !receiver) continue;
    try {
      await receiver.deliver(alert);
      await withJobRole(db, (transaction) =>
        transaction.unsafe<Row>(
          'select * from private.billing_alert_delivery_update(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::text, null::text)',
          [...jobContext, alert.alert_id, 'delivered'],
        ),
      );
      deliveredCount += 1;
    } catch (error) {
      const code = errorCode(error);
      receiverFailures.push(code);
      try {
        await withJobRole(db, (transaction) =>
          transaction.unsafe<Row>(
            'select * from private.billing_alert_delivery_update(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::text, $7::text)',
            [...jobContext, alert.alert_id, 'failed', code],
          ),
        );
      } catch (deliveryError) {
        receiverFailures.push(errorCode(deliveryError));
      }
    }
  }
  const pendingDeliveryCount =
    rows.filter((alert) => alert.needs_delivery === true).length -
    deliveredCount;
  return {
    observedCount: rows.length,
    activeCount: rows.filter((alert) => alert.status === 'active').length,
    recoveredCount: rows.filter((alert) => alert.status === 'recovered').length,
    deliveredCount,
    pendingDeliveryCount: Math.max(0, pendingDeliveryCount),
    receiverStatus:
      receiverFailures.length > 0
        ? 'failed'
        : receiver
          ? 'delivered'
          : 'not_configured',
    receiverFailures,
    alerts: rows,
  };
}

export async function billingAlertsEvaluate(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const result = await evaluateBillingAlerts(input, dependencies, id);
  return response(200, {
    observed_count: result.observedCount,
    active_count: result.activeCount,
    recovered_count: result.recoveredCount,
    delivered_count: result.deliveredCount,
    pending_delivery_count: result.pendingDeliveryCount,
    receiver_status: result.receiverStatus,
    receiver_failures: result.receiverFailures,
    alerts: result.alerts,
    request_id: id,
  });
}
