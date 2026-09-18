import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Form,
  Select,
  DatePicker,
  TimePicker,
  InputNumber,
  Radio,
  Input,
  Alert,
  Divider,
  Typography,
  Space,
  Tag,
  message,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useDispatch, useSelector } from 'react-redux';
import {
  BankOutlined,
  CreditCardOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import type { PaymentMethod, PaymentType } from '../../types';
import type { RootState } from '../../store';
import { addPaymentEntry } from '../../store';
import {
  PAYMENT_LABEL,
  categoryOf,
  defaultCommissionBase,
  genOrderNo,
  localDateTimeToIso,
  localDateOf,
  round2,
  validateBusinessDate,
} from '../../utils/closing';

const { Text } = Typography;

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  defaultBusinessDate?: string;
  /** 指定退单模式并预选原始流水 */
  presetRefundOfId?: string | null;
}

const todayStr = () => localDateOf(new Date());

const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  onClose,
  defaultBusinessDate,
  presetRefundOfId,
}) => {
  const dispatch = useDispatch();
  const state = useSelector((s: RootState) => s.app);
  const [form] = Form.useForm();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [payType, setPayType] = useState<PaymentType>('income');
  const [baseTouched, setBaseTouched] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [sharedOrderNo, setSharedOrderNo] = useState<string>('');
  const [refundSourceId, setRefundSourceId] = useState<string | null>(null);

  const initDefault = defaultBusinessDate || todayStr();

  const activeBeauticians = useMemo(
    () => state.employees.filter((e) => e.role === 'beautician' || e.role === 'technician'),
    [state.employees]
  );

  // 今天可冲减的收入流水（退单必须在当天冲减）
  const refundableEntries = useMemo(
    () =>
      state.paymentEntries
        .filter((e) => e.type === 'income' && e.amount > 0 && e.businessDate === initDefault)
        .slice()
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [state.paymentEntries, initDefault]
  );

  const refundSource = refundableEntries.find((e) => e.id === refundSourceId);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setBaseTouched(false);
    setSplitMode(false);
    setSharedOrderNo('');
    setMethod('cash');
    if (presetRefundOfId) {
      const src = state.paymentEntries.find((e) => e.id === presetRefundOfId);
      setPayType('refund');
      setRefundSourceId(presetRefundOfId);
      if (src) setMethod(src.method);
      form.setFieldsValue({
        type: 'refund',
        sourceId: presetRefundOfId,
        businessDate: dayjs(src?.businessDate || initDefault),
        time: dayjs(new Date(src?.receivedAt || new Date())),
        amount: src ? Math.abs(src.amount) : undefined,
        method: src?.method,
        commissionBase: src ? Math.abs(src.commissionBase) : undefined,
      });
    } else {
      setPayType('income');
      setRefundSourceId(null);
      form.setFieldsValue({
        type: 'income',
        businessDate: dayjs(initDefault),
        time: dayjs(new Date()),
        method: 'cash',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetRefundOfId]);

  const syncBase = (m: PaymentMethod, amt: number | null) => {
    if (baseTouched) return;
    const amount = amt || 0;
    form.setFieldValue('commissionBase', defaultCommissionBase(m, amount));
  };

  const applyRefundSource = (id: string) => {
    const src = state.paymentEntries.find((e) => e.id === id);
    if (!src) return;
    setRefundSourceId(id);
    setMethod(src.method);
    form.setFieldsValue({
      customerId: undefined,
      serviceId: undefined,
      employeeId: undefined,
      method: src.method,
      amount: Math.abs(src.amount),
      commissionBase: Math.abs(src.commissionBase),
    });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const businessDate: string = (values.businessDate as Dayjs).format('YYYY-MM-DD');
    const timeStr: string = (values.time as Dayjs).format('HH:mm');
    const receivedAt = localDateTimeToIso(businessDate, timeStr);

    // 规则：跨到第二天的不许并回前一天
    const dateError = validateBusinessDate(businessDate, receivedAt);
    if (dateError) {
      message.error(dateError);
      return;
    }
    if (businessDate > todayStr()) {
      message.error('营业日不能晚于今天');
      return;
    }

    const isRefund = values.type === 'refund';
    const signedAmount = round2((values.amount || 0) * (isRefund ? -1 : 1));
    const signedBase = round2((values.commissionBase || 0) * (isRefund ? -1 : 1));

    if (isRefund) {
      // 规则：退单必须在当天冲减
      if (businessDate !== todayStr()) {
        message.error('退单只能冲减当天的收入，请把营业日改回今天');
        return;
      }
      const src = state.paymentEntries.find((e) => e.id === values.sourceId);
      if (!src) {
        message.error('请选择要冲减的原始收款');
        return;
      }
      if (Math.abs(signedAmount) > Math.abs(src.amount) + 0.001) {
        message.error('退款金额不能超过原单金额');
        return;
      }
    }

    const serviceId = isRefund ? refundSource!.serviceId : values.serviceId;
    const customerId = isRefund ? refundSource!.customerId : values.customerId;
    const employeeId = isRefund ? refundSource!.employeeId : values.employeeId;
    const orderNo = isRefund
      ? genOrderNo(businessDate)
      : splitMode && sharedOrderNo
        ? sharedOrderNo
        : genOrderNo(businessDate);

    dispatch(
      addPaymentEntry({
        orderNo,
        businessDate,
        receivedAt,
        customerId,
        serviceId,
        category: categoryOf(serviceId, state.services),
        employeeId,
        method: values.method,
        amount: signedAmount,
        commissionBase: signedBase,
        type: values.type,
        refOrderNo: isRefund ? refundSource!.orderNo : undefined,
        note: values.note,
      })
    );

    message.success(
      isRefund ? '退单已登记，已在当天冲减' : splitMode ? '收款已登记，可继续拆分明细' : '收款已登记'
    );

    if (splitMode && !isRefund) {
      // 一单多付：保留单号、顾客、项目、美容师，清空金额继续录
      if (!sharedOrderNo) setSharedOrderNo(orderNo);
      form.setFieldsValue({
        amount: undefined,
        commissionBase: undefined,
        note: undefined,
        method: 'cash',
      });
      setBaseTouched(false);
      setMethod('cash');
    } else {
      onClose();
    }
  };

  const methodIcon = (m: PaymentMethod) =>
    m === 'cash' ? <BankOutlined /> : m === 'card' ? <CreditCardOutlined /> : <GiftOutlined />;

  return (
    <Modal
      title={payType === 'refund' ? '登记退单（当天冲减）' : '登记收款'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={payType === 'refund' ? '确认退单' : splitMode ? '保存并继续拆分' : '保存'}
      cancelText="关闭"
      width={620}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
          <Radio.Group
            onChange={(e) => {
              setPayType(e.target.value);
              setBaseTouched(false);
            }}
          >
            <Radio.Button value="income">收入</Radio.Button>
            <Radio.Button value="refund">退单冲减</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {payType === 'refund' ? (
          <>
            <Alert
              type="warning"
              style={{ marginBottom: 12 }}
              message="退单只能冲减当天发生的收入；冲减额会按收款方式与提成基数在今天的结账单中扣减。"
            />
            <Form.Item
              name="sourceId"
              label="冲减的原始收款"
              rules={[{ required: true, message: '请选择要冲减的原单' }]}
            >
              <Select
                showSearch
                placeholder="选择今天的原单"
                optionFilterProp="label"
                onChange={applyRefundSource}
                options={refundableEntries.map((e) => {
                  const customer = state.customers.find((c) => c.id === e.customerId);
                  const service = state.services.find((s) => s.id === e.serviceId);
                  return {
                    value: e.id,
                    label: `${e.orderNo} ${customer?.name || ''} ${service?.name || ''} ${PAYMENT_LABEL[e.method]} ¥${Math.abs(e.amount).toFixed(2)}`,
                  };
                })}
              />
            </Form.Item>
            {refundSource && (
              <Alert
                style={{ marginBottom: 12 }}
                type="info"
                showIcon
                message={
                  <Space direction="vertical" size={2}>
                    <Text>原单号：{refundSource.orderNo}</Text>
                    <Text>原收款方式：{PAYMENT_LABEL[refundSource.method]}</Text>
                    <Text>原实收：¥{Math.abs(refundSource.amount).toFixed(2)}</Text>
                  </Space>
                }
              />
            )}
          </>
        ) : null}

        <Space size={12} style={{ display: 'flex' }} styles={{ item: { flex: 1 } }}>
          <Form.Item
            name="businessDate"
            label="归属营业日"
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请选择营业日' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              allowClear={false}
              disabled={payType === 'refund'}
            />
          </Form.Item>
          <Form.Item
            name="time"
            label="实际收款时间"
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请选择收款时间' }]}
          >
            <TimePicker style={{ width: '100%' }} format="HH:mm" allowClear={false} minuteStep={5} />
          </Form.Item>
        </Space>

        {payType === 'income' && (
          <>
            <Form.Item
              name="customerId"
              label="顾客"
              rules={[{ required: true, message: '请选择顾客' }]}
            >
              <Select
                showSearch
                placeholder="选择顾客"
                optionFilterProp="label"
                options={state.customers.map((c) => ({ value: c.id, label: `${c.name} ${c.phone}` }))}
              />
            </Form.Item>
            <Form.Item
              name="serviceId"
              label="项目"
              rules={[{ required: true, message: '请选择项目' }]}
            >
              <Select
                showSearch
                placeholder="选择服务项目"
                optionFilterProp="label"
                options={state.services
                  .filter((s) => s.status === 'active')
                  .map((s) => ({ value: s.id, label: `${s.name}（${s.category} ¥${s.price}）` }))}
              />
            </Form.Item>
            <Form.Item
              name="employeeId"
              label="服务美容师（提成归属）"
              rules={[{ required: true, message: '请选择美容师' }]}
            >
              <Select
                showSearch
                placeholder="选择美容师"
                optionFilterProp="label"
                options={activeBeauticians.map((e) => ({
                  value: e.id,
                  label: `${e.name}（提成比例 ${(e.commissionRate * 100).toFixed(0)}%）`,
                }))}
              />
            </Form.Item>
          </>
        )}

        <Space size={12} style={{ display: 'flex' }} styles={{ item: { flex: 1 } }}>
          <Form.Item
            name="method"
            label="收款方式"
            style={{ flex: 1 }}
            rules={[{ required: true }]}
          >
            <Radio.Group
              onChange={(e) => {
                setMethod(e.target.value);
                syncBase(e.target.value, form.getFieldValue('amount'));
              }}
            >
              <Radio.Button value="cash">{methodIcon('cash')} 现金</Radio.Button>
              <Radio.Button value="card">{methodIcon('card')} 刷卡</Radio.Button>
              <Radio.Button value="voucher">{methodIcon('voucher')} 券</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="amount"
            label={payType === 'refund' ? '退款金额' : '实收金额'}
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              prefix="¥"
              onChange={(v) => syncBase(method, v)}
            />
          </Form.Item>
        </Space>

        <Form.Item
          name="commissionBase"
          label={
            <Space size={6}>
              提成基数
              {method === 'voucher' ? (
                <Tag color="purple">券默认不计提成基数</Tag>
              ) : (
                <Tag color="default">默认等于实收</Tag>
              )}
            </Space>
          }
          rules={[{ required: true, message: '请确认提成基数' }]}
          extra="券为预付载体，核销券不产生新的提成基数；若有平台抽佣等可手工调整。"
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            precision={2}
            prefix="¥"
            onChange={() => setBaseTouched(true)}
          />
        </Form.Item>

        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} placeholder="如：团购平台抽佣、退单原因、挂账说明等" />
        </Form.Item>

        {payType === 'income' && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <Space>
              <Text
                style={{ cursor: 'pointer', color: '#C9A86C' }}
                onClick={() => {
                  setSplitMode((v) => !v);
                  if (!splitMode) setSharedOrderNo('');
                }}
              >
                {splitMode ? '☑ 一单多付拆分录入中（共用同一单号）' : '☐ 一单多付？拆成现金+券等多笔录入'}
              </Text>
            </Space>
            {splitMode && sharedOrderNo && (
              <div style={{ marginTop: 6 }}>
                <Tag color="blue">共用单号 {sharedOrderNo}</Tag>
              </div>
            )}
          </>
        )}
      </Form>
    </Modal>
  );
};

export default PaymentModal;
