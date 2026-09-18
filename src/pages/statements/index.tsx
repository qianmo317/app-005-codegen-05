import React, { useMemo, useState } from 'react';
import {
  Row,
  Col,
  Card,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Select,
  DatePicker,
  Input,
  InputNumber,
  message,
  Table,
  Tabs,
  Alert,
  Empty
} from 'antd';
import {
  PlusOutlined,
  FileDoneOutlined,
  CheckCircleOutlined,
  EditOutlined,
  EyeOutlined,
  RollbackOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import dayjs, { Dayjs } from 'dayjs';
import type { RootState } from '../../store';
import {
  addPayment,
  saveStatement,
  confirmStatement,
  updateStatement
} from '../../store';
import type { Payment, DailyStatement, CommissionEntry } from '../../types';
import {
  formatCurrency,
  formatTime,
  formatDateTime,
  generateId,
  getStatusText,
  getStatusColor
} from '../../utils/format';
import { buildStatement, getBusinessDate } from '../../utils/settlement';
import StatementSummary from './StatementSummary';
import StatementDetail from './StatementDetail';

const Statements: React.FC = () => {
  const dispatch = useDispatch();
  const state = useSelector((s: RootState) => s.app);
  const { payments, dailyStatements, services, employees, customers } = state;

  const [bizDate, setBizDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [detailStatement, setDetailStatement] = useState<DailyStatement | null>(null);
  const [editStatement, setEditStatement] = useState<DailyStatement | null>(null);
  const [payForm] = Form.useForm();
  const [refundForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const staffOptions = employees.filter(
    (e) => (e.role === 'beautician' || e.role === 'technician') && e.status === 'active'
  );

  // 已结账（有确认单）的营业日集合：这些日期不允许再补录收入
  const confirmedDates = useMemo(
    () => new Set(dailyStatements.filter((s) => s.status === 'confirmed').map((s) => s.businessDate)),
    [dailyStatements]
  );

  const dayPayments = useMemo(
    () =>
      payments
        .filter((p) => getBusinessDate(p.paidAt) === bizDate)
        .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()),
    [payments, bizDate]
  );

  const dayStatements = useMemo(
    () =>
      dailyStatements
        .filter((s) => s.businessDate === bizDate)
        .sort((a, b) => a.seq - b.seq),
    [dailyStatements, bizDate]
  );

  const draft = dayStatements.find((s) => s.status === 'draft');
  const confirmedList = dayStatements.filter((s) => s.status === 'confirmed');

  // 未被任何账单覆盖的流水（确认单 + 草稿已覆盖的除外）
  const coveredIds = useMemo(() => {
    const ids = new Set<string>();
    dayStatements.forEach((s) => s.paymentIds.forEach((id) => ids.add(id)));
    return ids;
  }, [dayStatements]);

  const uncovered = useMemo(
    () => dayPayments.filter((p) => !coveredIds.has(p.id)),
    [dayPayments, coveredIds]
  );

  // 每笔收款已退金额
  const refundedMap = useMemo(() => {
    const map = new Map<string, number>();
    payments
      .filter((p) => p.type === 'refund' && p.refundOf)
      .forEach((p) => {
        map.set(p.refundOf!, (map.get(p.refundOf!) || 0) + -p.amount);
      });
    return map;
  }, [payments]);

  const nameOf = <T extends { id: string; name: string }>(list: T[], id: string) =>
    list.find((x) => x.id === id)?.name || id;

  // ---------- 结账单操作 ----------

  const handleGenerateMain = () => {
    if (dayPayments.length === 0) {
      message.warning('该营业日暂无收款流水，无法生成结账单');
      return;
    }
    const statement = buildStatement(bizDate, 'main', 1, dayPayments, services);
    dispatch(saveStatement(statement));
    message.success(`结账单 ${statement.statementNo} 已生成，请核对后确认`);
  };

  const handleGenerateSupplement = () => {
    if (uncovered.length === 0) return;
    const seq = dayStatements.length + 1;
    const statement = buildStatement(bizDate, 'supplement', seq, uncovered, services);
    dispatch(saveStatement(statement));
    message.success(`补充结账单 ${statement.statementNo} 已生成（当日已确认账单不受影响）`);
  };

  const handleRefreshDraft = () => {
    if (!draft || uncovered.length === 0) return;
    const draftPayments = dayPayments.filter((p) => draft.paymentIds.includes(p.id));
    const merged = buildStatement(
      bizDate,
      draft.type,
      draft.seq,
      [...draftPayments, ...uncovered],
      services,
      draft
    );
    dispatch(saveStatement(merged));
    message.success(`已纳入 ${uncovered.length} 笔新流水`);
  };

  const doConfirm = (statement: DailyStatement) => {
    dispatch(saveStatement(statement));
    dispatch(confirmStatement(statement.id));
    message.success(`结账单 ${statement.statementNo} 已确认留档`);
  };

  const handleConfirm = () => {
    if (!draft) return;
    const missing = draft.commissions.filter((c) => c.diff !== 0 && !c.diffNote.trim());
    if (missing.length > 0) {
      message.error(
        `提成对账存在差异，请先填写 ${missing.map((c) => nameOf(employees, c.employeeId)).join('、')} 的差异说明`
      );
      return;
    }
    if (uncovered.length > 0) {
      Modal.confirm({
        title: '还有流水未纳入本单',
        content: `当前还有 ${uncovered.length} 笔流水未纳入本结账单，确认时将自动纳入。确认后本单将留档，后续新增收入需另起补充单。`,
        okText: '纳入并确认',
        cancelText: '再想想',
        onOk: () => {
          const draftPayments = dayPayments.filter((p) => draft.paymentIds.includes(p.id));
          const merged = buildStatement(
            bizDate,
            draft.type,
            draft.seq,
            [...draftPayments, ...uncovered],
            services,
            draft
          );
          doConfirm(merged);
        }
      });
      return;
    }
    Modal.confirm({
      title: '确认结账单',
      content: `确认后 ${draft.statementNo} 将留档，金额数据不可再改；当日后续收入需另起补充单。`,
      okText: '确认留档',
      cancelText: '取消',
      onOk: () => doConfirm(draft)
    });
  };

  // ---------- 确认后修改（留痕） ----------

  const openEditModal = (statement: DailyStatement) => {
    setEditStatement(statement);
    editForm.setFieldsValue({
      remark: statement.remark,
      reason: '',
      ...Object.fromEntries(statement.commissions.map((c) => [`diff_${c.employeeId}`, c.diffNote]))
    });
  };

  const handleEditSubmit = async () => {
    if (!editStatement) return;
    try {
      const values = await editForm.validateFields();
      const commissions: CommissionEntry[] = editStatement.commissions.map((c) => ({
        ...c,
        diffNote: values[`diff_${c.employeeId}`] ?? c.diffNote
      }));
      dispatch(
        updateStatement({
          id: editStatement.id,
          remark: values.remark,
          commissions,
          reason: values.reason
        })
      );
      message.success('修改已保存并记录留痕');
      setEditStatement(null);
    } catch {
      // validation error
    }
  };

  // ---------- 收款 / 退款 ----------

  const handleAddPayment = async () => {
    try {
      const values = await payForm.validateFields();
      const paidAt: Dayjs = values.paidAt;
      if (paidAt.isAfter(dayjs())) {
        message.error('收款时间不能晚于当前时间');
        return;
      }
      const paidDate = paidAt.format('YYYY-MM-DD');
      if (confirmedDates.has(paidDate)) {
        message.error(`${paidDate} 已结账，跨日收入不能并回已结账日，请按实际收款时间入账`);
        return;
      }
      const payment: Payment = {
        id: generateId(),
        type: 'payment',
        customerId: values.customerId,
        serviceId: values.serviceId,
        employeeId: values.employeeId,
        listPrice: values.listPrice,
        amount: values.amount,
        method: values.method,
        paidAt: paidAt.toISOString(),
        note: values.note || '',
        createdAt: new Date().toISOString()
      };
      dispatch(addPayment(payment));
      if (confirmedDates.size > 0 && paidDate === bizDate && confirmedList.length > 0) {
        message.info('该营业日已有确认账单，此笔收入将计入补充结账单');
      } else {
        message.success('收款已入账');
      }
      setPayModalOpen(false);
    } catch {
      // validation error
    }
  };

  const handleRefund = async () => {
    if (!refundTarget) return;
    try {
      const values = await refundForm.validateFields();
      const refund: Payment = {
        id: generateId(),
        type: 'refund',
        customerId: refundTarget.customerId,
        serviceId: refundTarget.serviceId,
        employeeId: refundTarget.employeeId,
        listPrice: -values.amount,
        amount: -values.amount,
        method: refundTarget.method,
        paidAt: new Date().toISOString(),
        refundOf: refundTarget.id,
        reason: values.reason,
        note: '',
        createdAt: new Date().toISOString()
      };
      dispatch(addPayment(refund));
      if (confirmedList.length > 0 && getBusinessDate(refund.paidAt) === bizDate) {
        message.info('该营业日已有确认账单，此笔退款将在补充结账单中冲减');
      } else {
        message.success('退款已登记，将在退款当日冲减');
      }
      setRefundTarget(null);
    } catch {
      // validation error
    }
  };

  // ---------- 表格列 ----------

  const paymentColumns = [
    {
      title: '时间',
      dataIndex: 'paidAt',
      width: 70,
      render: (v: string) => formatTime(v)
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 70,
      render: (v: string) => <Tag color={getStatusColor(v)}>{getStatusText(v)}</Tag>
    },
    {
      title: '顾客',
      dataIndex: 'customerId',
      render: (id: string) => nameOf(customers, id)
    },
    {
      title: '项目',
      dataIndex: 'serviceId',
      render: (id: string) => nameOf(services, id)
    },
    {
      title: '美容师',
      dataIndex: 'employeeId',
      render: (id: string) => nameOf(employees, id)
    },
    {
      title: '方式',
      dataIndex: 'method',
      width: 70,
      render: (v: string) => <Tag color={getStatusColor(v)}>{getStatusText(v)}</Tag>
    },
    {
      title: '应收',
      dataIndex: 'listPrice',
      align: 'right' as const,
      render: (v: number) => (
        <span style={v < 0 ? { color: '#ff4d4f' } : undefined}>{formatCurrency(v)}</span>
      )
    },
    {
      title: '实收',
      dataIndex: 'amount',
      align: 'right' as const,
      render: (v: number) => (
        <span style={v < 0 ? { color: '#ff4d4f', fontWeight: 600 } : undefined}>
          {formatCurrency(v)}
        </span>
      )
    },
    {
      title: '备注/原因',
      render: (_: unknown, r: Payment) =>
        r.reason || r.note || <span style={{ color: '#bfbfbf' }}>—</span>
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, r: Payment) => {
        if (r.type !== 'payment') return null;
        const remaining = r.amount - (refundedMap.get(r.id) || 0);
        if (remaining <= 0) return <Tag>已退清</Tag>;
        return (
          <Button
            type="link"
            size="small"
            danger
            icon={<RollbackOutlined />}
            onClick={() => {
              setRefundTarget(r);
              refundForm.setFieldsValue({ amount: remaining, reason: '' });
            }}
          >
            退款
          </Button>
        );
      }
    }
  ];

  const statementColumns = [
    {
      title: '单号',
      dataIndex: 'statementNo',
      render: (v: string, r: DailyStatement) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{v}</span>
          <Tag color={getStatusColor(r.type)}>{getStatusText(r.type)}</Tag>
        </Space>
      )
    },
    { title: '营业日', dataIndex: 'businessDate' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string, r: DailyStatement) => (
        <Space>
          <Tag color={getStatusColor(v)}>{getStatusText(v)}</Tag>
          {r.revisions.length > 0 && <Tag color="orange">已修改 {r.revisions.length} 次</Tag>}
        </Space>
      )
    },
    {
      title: '净收入',
      dataIndex: 'netIncome',
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: v < 0 ? '#ff4d4f' : '#C9A86C' }}>
          {formatCurrency(v)}
        </span>
      )
    },
    {
      title: '现金/刷卡/券',
      render: (_: unknown, r: DailyStatement) =>
        `${formatCurrency(r.byMethod.cash)} / ${formatCurrency(r.byMethod.card)} / ${formatCurrency(r.byMethod.voucher)}`
    },
    {
      title: '流水笔数',
      dataIndex: 'paymentIds',
      align: 'center' as const,
      render: (ids: string[]) => ids.length
    },
    {
      title: '确认时间',
      dataIndex: 'confirmedAt',
      render: (v?: string) => (v ? formatDateTime(v) : '—')
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, r: DailyStatement) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailStatement(r)}>
            详情
          </Button>
          {r.status === 'confirmed' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)}>
              修改
            </Button>
          )}
        </Space>
      )
    }
  ];

  // ---------- 渲染 ----------

  const currentTab = (
    <>
      <Card
        className="card-wrapper"
        title={`当日流水（${dayPayments.length} 笔）`}
        bordered={false}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            payForm.resetFields();
            payForm.setFieldsValue({ paidAt: dayjs(), method: 'cash' });
            setPayModalOpen(true);
          }}>
            新增收款
          </Button>
        }
      >
        {dayPayments.length > 0 ? (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={dayPayments}
            columns={paymentColumns}
            scroll={{ x: 900 }}
          />
        ) : (
          <Empty description="该营业日暂无收款流水" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {draft && uncovered.length > 0 && (
        <Alert
          style={{ marginTop: 16 }}
          type="warning"
          showIcon
          message={`有 ${uncovered.length} 笔流水尚未纳入草稿结账单`}
          action={
            <Button size="small" icon={<SyncOutlined />} onClick={handleRefreshDraft}>
              纳入新流水
            </Button>
          }
        />
      )}

      {!draft && confirmedList.length > 0 && uncovered.length > 0 && (
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message={`该日结账单已确认，现有 ${uncovered.length} 笔新流水（含退单冲减），需另起补充结账单`}
          action={
            <Button size="small" type="primary" onClick={handleGenerateSupplement}>
              生成补充结账单
            </Button>
          }
        />
      )}

      {draft ? (
        <Card
          className="card-wrapper"
          style={{ marginTop: 16 }}
          title={
            <Space>
              <FileDoneOutlined />
              <span>结账单草稿 {draft.statementNo}</span>
              <Tag color={getStatusColor(draft.type)}>{getStatusText(draft.type)}</Tag>
            </Space>
          }
          bordered={false}
          extra={
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleConfirm}>
              确认结账
            </Button>
          }
        >
          <StatementSummary
            statement={draft}
            employees={employees}
            editable
            onCommissionsChange={(commissions) =>
              dispatch(saveStatement({ ...draft, commissions }))
            }
            onRemarkChange={(remark) => dispatch(saveStatement({ ...draft, remark }))}
          />
        </Card>
      ) : (
        confirmedList.length === 0 && (
          <Card className="card-wrapper" style={{ marginTop: 16 }} bordered={false}>
            <Empty
              description={
                dayPayments.length > 0
                  ? '尚未生成结账单，请在关店前生成并确认'
                  : '该营业日无收入，无需结账'
              }
            >
              {dayPayments.length > 0 && (
                <Button type="primary" icon={<FileDoneOutlined />} onClick={handleGenerateMain}>
                  生成结账单
                </Button>
              )}
            </Empty>
          </Card>
        )
      )}

      {confirmedList.length > 0 && (
        <Card className="card-wrapper" style={{ marginTop: 16 }} title="当日已确认账单" bordered={false}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={confirmedList}
            columns={statementColumns}
          />
        </Card>
      )}
    </>
  );

  const historyTab = (
    <Card className="card-wrapper" title="结账单留档" bordered={false}>
      <Table
        size="small"
        rowKey="id"
        dataSource={[...dailyStatements].sort((a, b) =>
          b.businessDate === a.businessDate ? b.seq - a.seq : b.businessDate.localeCompare(a.businessDate)
        )}
        columns={statementColumns}
        pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 张` }}
      />
    </Card>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">日结账单</h1>
          <p className="page-header-subtitle">每日关店前核对当日收入，确认后留档</p>
        </div>
        <DatePicker
          value={dayjs(bizDate)}
          allowClear={false}
          disabledDate={(d) => d && d.isAfter(dayjs(), 'day')}
          onChange={(d) => d && setBizDate(d.format('YYYY-MM-DD'))}
        />
      </div>

      <Tabs
        defaultActiveKey="current"
        items={[
          { key: 'current', label: '当日结账', children: currentTab },
          { key: 'history', label: '历史留档', children: historyTab }
        ]}
      />

      {/* 新增收款 */}
      <Modal
        title="新增收款"
        open={payModalOpen}
        onOk={handleAddPayment}
        onCancel={() => setPayModalOpen(false)}
        okText="入账"
        cancelText="取消"
        width={520}
        destroyOnClose
      >
        <Form form={payForm} layout="vertical">
          <Form.Item
            name="customerId"
            label="顾客"
            rules={[{ required: true, message: '请选择顾客' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="搜索并选择顾客"
              options={customers.map((c) => ({ value: c.id, label: `${c.name} - ${c.phone}` }))}
            />
          </Form.Item>
          <Form.Item
            name="serviceId"
            label="项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select
              placeholder="请选择项目"
              options={services.map((s) => ({
                value: s.id,
                label: `${s.name} - ${formatCurrency(s.price)}`
              }))}
              onChange={(serviceId) => {
                const service = services.find((s) => s.id === serviceId);
                if (service) {
                  payForm.setFieldsValue({ listPrice: service.price, amount: service.price });
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="employeeId"
            label="美容师（提成归属）"
            rules={[{ required: true, message: '请选择美容师' }]}
          >
            <Select
              placeholder="请选择美容师"
              options={staffOptions.map((e) => ({
                value: e.id,
                label: `${e.name} - ${getStatusText(e.role)}`
              }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="listPrice"
                label="应收金额（提成基数）"
                rules={[{ required: true, message: '请输入应收金额' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="amount"
                label="实收金额"
                rules={[{ required: true, message: '请输入实收金额' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="method"
                label="收款方式"
                rules={[{ required: true, message: '请选择收款方式' }]}
              >
                <Select
                  options={[
                    { value: 'cash', label: '现金' },
                    { value: 'card', label: '刷卡' },
                    { value: 'voucher', label: '券' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="paidAt"
                label="收款时间"
                rules={[{ required: true, message: '请选择收款时间' }]}
                extra="已结账的日期不可补录，跨日收入计入实际收款日"
              >
                <DatePicker
                  style={{ width: '100%' }}
                  showTime={{ format: 'HH:mm' }}
                  format="YYYY-MM-DD HH:mm"
                  disabledDate={(d) =>
                    (d && d.isAfter(dayjs(), 'day')) || confirmedDates.has(d.format('YYYY-MM-DD'))
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="备注">
            <Input placeholder="如：会员优惠减免等（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 退款 */}
      <Modal
        title="退单冲减"
        open={!!refundTarget}
        onOk={handleRefund}
        onCancel={() => setRefundTarget(null)}
        okText="确认退款"
        cancelText="取消"
        destroyOnClose
      >
        {refundTarget && (
          <Form form={refundForm} layout="vertical">
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`原单：${nameOf(customers, refundTarget.customerId)} / ${nameOf(services, refundTarget.serviceId)} / ${getStatusText(refundTarget.method)} ${formatCurrency(refundTarget.amount)}，退款将按原收款方式在今日冲减`}
            />
            <Form.Item
              name="amount"
              label="退款金额"
              rules={[{ required: true, message: '请输入退款金额' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0.01}
                max={refundTarget.amount - (refundedMap.get(refundTarget.id) || 0)}
                precision={2}
                prefix="¥"
              />
            </Form.Item>
            <Form.Item
              name="reason"
              label="退款原因"
              rules={[{ required: true, message: '请填写退款原因' }]}
            >
              <Input.TextArea rows={2} placeholder="请填写退款原因" />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 确认后修改（留痕） */}
      <Modal
        title={editStatement ? `修改结账单 ${editStatement.statementNo}` : ''}
        open={!!editStatement}
        onOk={handleEditSubmit}
        onCancel={() => setEditStatement(null)}
        okText="保存修改"
        cancelText="取消"
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="已确认账单仅可修改备注与差异说明，每次修改都会留痕"
        />
        <Form form={editForm} layout="vertical">
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          {editStatement?.commissions.map((c) => (
            <Form.Item
              key={c.employeeId}
              name={`diff_${c.employeeId}`}
              label={`${nameOf(employees, c.employeeId)} 提成差异说明（差异 ${formatCurrency(c.diff)}）`}
            >
              <Input placeholder="差异原因说明" />
            </Form.Item>
          ))}
          <Form.Item
            name="reason"
            label="修改原因（留痕）"
            rules={[{ required: true, message: '请填写修改原因' }]}
          >
            <Input placeholder="本次修改的原因，将记入修改历史" />
          </Form.Item>
        </Form>
      </Modal>

      <StatementDetail
        statement={detailStatement}
        payments={payments}
        employees={employees}
        services={services}
        customers={customers}
        onClose={() => setDetailStatement(null)}
      />
    </div>
  );
};

export default Statements;
