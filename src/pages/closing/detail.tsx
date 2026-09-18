import React, { useMemo, useState } from 'react';
import {
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Table,
  Alert,
  Descriptions,
  Timeline,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  message,
  Divider,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { RootState } from '../../store';
import {
  amendConfirmedStatement,
  confirmStatement,
  deleteDraftStatement,
  updateDraftStatement,
} from '../../store';
import type {
  BeauticianTotal,
  CategoryTotal,
  ClosingStatement,
  ManualReconItem,
  PaymentEntry,
  PaymentMethodTotal,
  StatementRevision,
} from '../../types';
import {
  PAYMENT_COLOR,
  PAYMENT_LABEL,
  genManualDiffId,
  round2,
} from '../../utils/closing';
import { formatCurrency } from '../../utils/format';

const { Title, Text, Paragraph } = Typography;

const DetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const state = useSelector((s: RootState) => s.app);

  const stmt = state.closingStatements.find((s) => s.id === id);

  const [noteEditOpen, setNoteEditOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [noteForm] = Form.useForm();

  const entries: PaymentEntry[] = useMemo(
    () => (stmt ? [...stmt.entriesSnapshot].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)) : []),
    [stmt]
  );

  if (!stmt) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/closing')} style={{ marginBottom: 16 }}>
          返回
        </Button>
        <Empty description="结账单不存在或已被删除" />
      </div>
    );
  }

  const isDraft = stmt.status === 'draft';

  /* ---------- 收款方式 ---------- */
  const methodColumns: ColumnsType<PaymentMethodTotal> = [
    { title: '收款方式', dataIndex: 'method', render: (m: PaymentEntry['method']) => (
      <Tag color={PAYMENT_COLOR[m]} style={{ fontSize: 13, padding: '2px 10px' }}>{PAYMENT_LABEL[m]}</Tag>
    ) },
    { title: '笔数', dataIndex: 'count', width: 120, align: 'center' },
    { title: '金额（退单已冲减）', dataIndex: 'amount', width: 220, align: 'right',
      render: (v: number) => <Text strong>{formatCurrency(v)}</Text> },
  ];

  /* ---------- 项目分类 ---------- */
  const categoryColumns: ColumnsType<CategoryTotal> = [
    { title: '项目分类', dataIndex: 'category' },
    { title: '单数', dataIndex: 'count', width: 120, align: 'center' },
    { title: '金额（退单已冲减）', dataIndex: 'amount', width: 220, align: 'right',
      render: (v: number) => <Text strong>{formatCurrency(v)}</Text> },
  ];

  /* ---------- 美容师提成 ---------- */
  const beauticianColumns: ColumnsType<BeauticianTotal> = [
    { title: '美容师', dataIndex: 'name', render: (v, r) => (
      <Space direction="vertical" size={0}>
        <Text strong>{v}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          服务 {r.count} 单 · 提成比例 {(r.rate * 100).toFixed(0)}%
        </Text>
      </Space>
    ) },
    { title: '实收合计', dataIndex: 'received', width: 140, align: 'right', render: (v: number) => formatCurrency(v) },
    { title: '其中券', dataIndex: 'voucherAmount', width: 130, align: 'right',
      render: (v: number) => v ? <Text type="secondary">{formatCurrency(v)}</Text> : '—' },
    { title: '提成基数', dataIndex: 'commissionBase', width: 140, align: 'right',
      render: (v: number) => <Text strong style={{ color: '#C9A86C' }}>{formatCurrency(v)}</Text> },
    { title: '实收−基数 差', key: 'diff', width: 130, align: 'right',
      render: (_, r) => {
        const diff = round2(r.received - r.commissionBase);
        return (
          <Space direction="vertical" size={0}>
            <Text type={Math.abs(diff) < 0.01 ? 'success' : 'warning'}>{formatCurrency(diff)}</Text>
            {Math.abs(r.voucherAmount) > 0.01 && <Text type="secondary" style={{ fontSize: 11 }}>券 ¥{Math.abs(r.voucherAmount).toFixed(2)} 不计基数</Text>}
          </Space>
        );
      } },
    { title: '试算提成', dataIndex: 'commission', width: 130, align: 'right',
      render: (v: number) => <Text strong>{formatCurrency(v)}</Text> },
  ];

  /* ---------- 流水明细 ---------- */
  const entryColumns: ColumnsType<PaymentEntry> = [
    { title: '单号 / 冲减原单', width: 190, render: (_, r) => (
      <Space direction="vertical" size={0}>
        <Text style={{ fontSize: 12 }}>{r.orderNo}</Text>
        {r.refOrderNo && <Text type="warning" style={{ fontSize: 11 }}>退原单 {r.refOrderNo}</Text>}
      </Space>
    ) },
    { title: '时间', dataIndex: 'receivedAt', width: 70, render: (v: string) => dayjs(v).format('HH:mm') },
    { title: '顾客', width: 80, render: (_, r) => state.customers.find((c) => c.id === r.customerId)?.name || '—' },
    { title: '项目分类', dataIndex: 'category', width: 90 },
    { title: '美容师', width: 80, render: (_, r) => state.employees.find((e) => e.id === r.employeeId)?.name || '—' },
    { title: '方式', dataIndex: 'method', width: 70, render: (m: PaymentEntry['method']) => (
      <Tag color={PAYMENT_COLOR[m]}>{PAYMENT_LABEL[m]}</Tag>
    ) },
    { title: '类型', dataIndex: 'type', width: 70, render: (t: string) =>
      t === 'refund' ? <Tag color="red">退单</Tag> : <Tag>收入</Tag> },
    { title: '实收', dataIndex: 'amount', width: 110, align: 'right',
      render: (v: number) => <Text type={v < 0 ? 'danger' : undefined} strong>{formatCurrency(v)}</Text> },
    { title: '提成基数', dataIndex: 'commissionBase', width: 110, align: 'right', render: (v: number) => formatCurrency(v) },
    { title: '备注', dataIndex: 'note', ellipsis: true, render: (v) => v || '—' },
  ];

  /* ---------- 操作 ---------- */
  const handleConfirm = () => {
    if (!stmt.reconciliation.balanced) {
      message.error('实收与提成基数存在未解释差异，请先在对账区补登说明，差异为 0 后才能确认');
      return;
    }
    try {
      dispatch(confirmStatement({ id: stmt.id }));
      message.success('结账单已确认并留档，相关流水已锁定');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const addManualDiff = () => {
    const next = [...stmt.manualDiffs, { id: genManualDiffId(), reason: '', amount: 0 }];
    dispatch(updateDraftStatement({ id: stmt.id, manualDiffs: next }));
  };

  const changeManualDiff = (mid: string, patch: Partial<ManualReconItem>) => {
    const next = stmt.manualDiffs.map((m) => (m.id === mid ? { ...m, ...patch } : m));
    dispatch(updateDraftStatement({ id: stmt.id, manualDiffs: next }));
  };

  const removeManualDiff = (mid: string) => {
    dispatch(updateDraftStatement({ id: stmt.id, manualDiffs: stmt.manualDiffs.filter((m) => m.id !== mid) }));
  };

  const saveNote = async () => {
    const values = await noteForm.validateFields();
    dispatch(updateDraftStatement({ id: stmt.id, note: values.note }));
    setNoteEditOpen(false);
    message.success('备注已保存');
  };

  const reconKindColor = (kind: string) =>
    kind === 'voucher' ? 'purple' : kind === 'manual' ? 'gold' : 'red';

  return (
    <div>
      <div className="page-header">
        <div>
          <Space align="center">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/closing')}>返回列表</Button>
            <Title level={3} style={{ margin: 0 }}>{stmt.no}</Title>
            {isDraft ? <Tag color="orange">草稿待确认</Tag> : <Tag color="green">已确认留档</Tag>}
            {stmt.type === 'supplement' && <Tag color="geekblue">确认后补单</Tag>}
          </Space>
          <p className="page-header-subtitle" style={{ marginTop: 8 }}>
            营业日 {stmt.businessDate}
            {stmt.type === 'supplement' && ' · 当日已有结账单确认在先，本单为另起的补单，未并回原单'}
          </p>
        </div>
        <Space>
          {isDraft ? (
            <>
              <Popconfirm
                title="确认结账并留档？"
                description="确认后相关流水将锁定，再补收入需另起一张补单"
                onConfirm={handleConfirm}
                disabled={!stmt.reconciliation.balanced}
              >
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckCircleOutlined />}
                  disabled={!stmt.reconciliation.balanced}
                >
                  确认结账并留档
                </Button>
              </Popconfirm>
              <Popconfirm
                title="删除这张草稿？"
                onConfirm={() => {
                  dispatch(deleteDraftStatement({ id: stmt.id }));
                  navigate('/closing');
                }}
              >
                <Button danger>删除草稿</Button>
              </Popconfirm>
            </>
          ) : (
            <Button icon={<EditOutlined />} onClick={() => setAmendOpen(true)}>修改并留痕</Button>
          )}
        </Space>
      </div>

      {/* 核心数字 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <Statistic title="现金" value={stmt.totals.cash} precision={2} prefix="¥" valueStyle={{ color: '#C9A86C' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <Statistic title="刷卡" value={stmt.totals.card} precision={2} prefix="¥" valueStyle={{ color: '#3b7dd8' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <Statistic title="券" value={stmt.totals.voucher} precision={2} prefix="¥" valueStyle={{ color: '#9254de' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <Statistic title="实收合计" value={stmt.totals.totalReceived} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <Statistic title="提成基数合计" value={stmt.totals.commissionBase} precision={2} prefix="¥"
              valueStyle={{ color: '#B5793A' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <Statistic title="退单冲减" value={Math.abs(stmt.totals.refund)} precision={2} prefix="¥"
              valueStyle={{ color: stmt.totals.refund < 0 ? '#cf1322' : undefined }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <Statistic title="流水笔数" value={stmt.totals.count} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="card-wrapper">
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>对账结果</div>
            {stmt.reconciliation.balanced ? (
              <Space><CheckCircleOutlined style={{ color: '#52c41a', fontSize: 22 }} /><Text strong type="success">实收与提成基数对得上</Text></Space>
            ) : (
              <Space direction="vertical" size={0}>
                <Space><ExclamationCircleOutlined style={{ color: '#cf1322', fontSize: 22 }} /><Text strong type="danger">对不上</Text></Space>
                <Text type="danger" style={{ fontSize: 12 }}>未解释差异 {formatCurrency(stmt.reconciliation.unexplained)}</Text>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* 对账区 */}
      <Card
        bordered={false}
        className="card-wrapper"
        style={{ marginTop: 16 }}
        title="对账：实收 vs 美容师提成基数"
        extra={
          isDraft ? (
            <Button size="small" icon={<PlusOutlined />} onClick={addManualDiff}>补登手工对账说明</Button>
          ) : undefined
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          核对公式：实收合计 − 提成基数合计 = 券金额 + 手工说明金额，两边相等即“对得上”。
          券为顾客预付载体，核销当天不产生新提成，故不计入提成基数；其余差额（平台抽佣、挂账、抹零等）必须逐条写明原因。
        </Paragraph>

        <Descriptions column={3} size="small" bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="实收合计">{formatCurrency(stmt.totals.totalReceived)}</Descriptions.Item>
          <Descriptions.Item label="提成基数合计">{formatCurrency(stmt.totals.commissionBase)}</Descriptions.Item>
          <Descriptions.Item label="差额（实收 − 基数）">
            <Text strong>{formatCurrency(round2(stmt.totals.totalReceived - stmt.totals.commissionBase))}</Text>
          </Descriptions.Item>
        </Descriptions>

        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={stmt.reconciliation.items}
          columns={[
            { title: '差异构成', dataIndex: 'label' },
            { title: '类型', dataIndex: 'kind', width: 120, render: (k: string) => (
              <Tag color={reconKindColor(k)}>
                {k === 'voucher' ? '券（不计提成）' : k === 'manual' ? '手工说明' : '未解释'}
              </Tag>
            ) },
            { title: '金额', dataIndex: 'amount', width: 160, align: 'right',
              render: (v: number, r) => (
                <Text type={r.kind === 'unexplained' ? 'danger' : undefined} strong>
                  {v > 0 ? '+' : ''}{formatCurrency(v)}
                </Text>
              ) },
            isDraft
              ? {
                  title: '操作', width: 80, align: 'center' as const,
                  render: (_: unknown, r: { key: string; kind: string }) =>
                    r.kind === 'manual' ? (
                      <Button type="link" size="small" danger icon={<DeleteOutlined />}
                        onClick={() => removeManualDiff(r.key)} />
                    ) : '—',
                }
              : { title: '', width: 1, render: () => '' },
          ]}
        />

        {isDraft && stmt.manualDiffs.some((m) => !m.reason) && (
          <Alert style={{ marginTop: 12 }} type="warning" showIcon message="有手工对账说明还没填写原因，请补全。" />
        )}

        {/* 可编辑的手工说明表单行（草稿） */}
        {isDraft && stmt.manualDiffs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {stmt.manualDiffs.map((m) => (
              <Space key={m.id} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <Input
                  style={{ width: 420 }}
                  placeholder="差异原因，如：美团平台抽佣 / 老客挂账 / 抹零"
                  value={m.reason}
                  onChange={(e) => changeManualDiff(m.id, { reason: e.target.value })}
                />
                <InputNumber
                  style={{ width: 160 }}
                  precision={2}
                  prefix="¥"
                  addonBefore="对差额影响"
                  value={m.amount}
                  onChange={(v) => changeManualDiff(m.id, { amount: round2(v || 0) })}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {m.amount >= 0 ? '实收多于基数填正' : '实收少于基数填负'}
                </Text>
              </Space>
            ))}
          </div>
        )}

        {!stmt.reconciliation.balanced ? (
          <Alert
            style={{ marginTop: 12 }}
            type="error"
            showIcon
            message={`对不上：仍有 ${formatCurrency(stmt.reconciliation.unexplained)} 的差额没有解释，不能确认结账。请核实是否漏登收款、金额录错，或补登手工说明。`}
          />
        ) : (
          <Alert style={{ marginTop: 12 }} type="success" showIcon message="差额已全部解释清楚，可以确认结账。" />
        )}
      </Card>

      {/* 收款方式 + 项目分类 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card bordered={false} className="card-wrapper" title="按收款方式汇总">
            <Table rowKey="method" size="small" pagination={false} columns={methodColumns} dataSource={stmt.byMethod} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card bordered={false} className="card-wrapper" title="按项目分类汇总">
            <Table rowKey="category" size="small" pagination={false} columns={categoryColumns} dataSource={stmt.byCategory} />
          </Card>
        </Col>
      </Row>

      {/* 美容师提成 */}
      <Card bordered={false} className="card-wrapper" style={{ marginTop: 16 }} title="美容师提成基数（单独列示）">
        <Table rowKey="employeeId" size="small" pagination={false} columns={beauticianColumns} dataSource={stmt.byBeautician} />
      </Card>

      {/* 流水明细 */}
      <Card
        bordered={false}
        className="card-wrapper"
        style={{ marginTop: 16 }}
        title={`流水明细（${entries.length} 笔）`}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>
          {isDraft ? '金额如需调整可在“收款管理”删除重录；确认后只允许通过“修改并留痕”更正' : '为确认时冻结的留档快照'}
        </Text>}
      >
        <Table rowKey="id" size="small" pagination={false} columns={entryColumns} dataSource={entries} scroll={{ x: 1050 }} />
      </Card>

      {/* 备注 + 留档信息 + 修改痕迹 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            bordered={false}
            className="card-wrapper"
            title="结账单备注"
            extra={isDraft ? <Button type="link" size="small" icon={<EditOutlined />} onClick={() => {
              noteForm.setFieldsValue({ note: stmt.note });
              setNoteEditOpen(true);
            }}>编辑</Button> : undefined}
          >
            {stmt.note ? <Paragraph style={{ margin: 0 }}>{stmt.note}</Paragraph> : <Text type="secondary">无备注</Text>}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card bordered={false} className="card-wrapper" title="留档信息">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="制表人">{stmt.createdBy} · {dayjs(stmt.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              {stmt.confirmedAt && (
                <Descriptions.Item label="确认人">
                  {stmt.confirmedBy} · {dayjs(stmt.confirmedAt).format('YYYY-MM-DD HH:mm')}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="修改次数">{stmt.revisions.filter((r) => r.action === 'amend').length} 次</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="card-wrapper" style={{ marginTop: 16 }} title={<Space><HistoryOutlined /><span>修改痕迹</span></Space>}>
        <Timeline
          items={[...stmt.revisions].reverse().map((r: StatementRevision) => ({
            color: r.action === 'confirm' ? 'green' : r.action === 'amend' ? 'orange' : 'gray',
            children: (
              <div>
                <Space>
                  <Text strong>{revisionActionText(r.action)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{r.operator} · {dayjs(r.at).format('YYYY-MM-DD HH:mm')}</Text>
                </Space>
                {r.reason && <div><Text type="secondary">原因：</Text>{r.reason}</div>}
                {r.changes.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {r.changes.map((c) => (
                      <li key={c.field} style={{ fontSize: 13 }}>
                        <Text>{c.label}：</Text>
                        <Text delete type="secondary">{c.before}</Text>
                        <Text> → </Text>
                        <Text strong>{c.after}</Text>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          }))}
        />
      </Card>

      {/* 备注编辑 */}
      <Modal title="编辑结账单备注" open={noteEditOpen} onOk={saveNote} onCancel={() => setNoteEditOpen(false)} okText="保存" cancelText="取消">
        <Form form={noteForm} layout="vertical">
          <Form.Item name="note">
            <Input.TextArea rows={3} placeholder="可填写交班说明、异常情况等" />
          </Form.Item>
        </Form>
      </Modal>

      <AmendModal stmt={stmt} open={amendOpen} onClose={() => setAmendOpen(false)} />
    </div>
  );
};

const revisionActionText = (a: StatementRevision['action']) =>
  a === 'create' ? '生成草稿' : a === 'confirm' ? '确认留档' : '修改（已留痕）';

/* ================= 已确认结账单的修改弹窗 ================= */

const AmendModal: React.FC<{ stmt: ClosingStatement; open: boolean; onClose: () => void }> = ({ stmt, open, onClose }) => {
  const dispatch = useDispatch();
  const [reason, setReason] = useState('');
  const [entryPatches, setEntryPatches] = useState<Record<string, { amount?: number; commissionBase?: number; note?: string }>>({});
  const [manualRows, setManualRows] = useState<ManualReconItem[]>([]);
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (open) {
      setReason('');
      setEntryPatches({});
      setManualRows(stmt.manualDiffs.map((m) => ({ ...m })));
      setNote(stmt.note);
    }
  }, [open, stmt]);

  const patchedEntries = useMemo(
    () => stmt.entriesSnapshot.map((e) => ({ ...e, ...entryPatches[e.id] })),
    [stmt, entryPatches]
  );

  // 预估修改后的对账结果
  const preview = useMemo(() => {
    const total = (sel: (e: PaymentEntry) => number) =>
      round2(patchedEntries.reduce((s, e) => s + sel(e), 0));
    const received = total((e) => e.amount);
    const base = total((e) => e.commissionBase);
    const diff = round2(received - base);
    const explained = round2(
      round2(patchedEntries.filter((e) => e.method === 'voucher').reduce((s, e) => s + e.amount, 0))
      + manualRows.reduce((s, m) => s + (m.reason ? m.amount : 0), 0)
    );
    return { received, base, unexplained: round2(diff - explained) };
  }, [patchedEntries, manualRows]);

  const hasChanges =
    Object.keys(entryPatches).length > 0 ||
    JSON.stringify(manualRows) !== JSON.stringify(stmt.manualDiffs) ||
    note !== stmt.note;

  const handleOk = () => {
    if (!reason.trim()) {
      message.error('请填写修改原因（修改留痕必需）');
      return;
    }
    if (manualRows.some((m) => !m.reason)) {
      message.error('存在没有原因的手工对账说明');
      return;
    }
    if (Math.abs(preview.unexplained) >= 0.01) {
      message.error(`修改后仍有 ${formatCurrency(preview.unexplained)} 未解释差异，不能保存`);
      return;
    }
    if (!hasChanges) {
      message.info('没有任何改动');
      return;
    }
    try {
      dispatch(
        amendConfirmedStatement({
          id: stmt.id,
          reason: reason.trim(),
          entryPatches: Object.entries(entryPatches).map(([pid, p]) => ({ id: pid, ...p })),
          manualDiffs: manualRows,
          note,
        })
      );
      message.success('修改已保存并记录到修改痕迹');
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Modal
      title={`修改结账单 ${stmt.no}（留档后更正）`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      width={860}
      okText="提交修改并留痕"
      cancelText="取消"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="本单已确认留档，不能直接覆盖。所有改动会记录操作人、时间、原因及每项改动的前后值。不能新增/删除流水——确认后补登的收入请回列表另起补单。"
      />
      <Form layout="vertical">
        <Form.Item label="修改原因（必填）" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：顾客刷卡金额录错 / 团购抽佣当时未登记" />
        </Form.Item>
      </Form>

      <Divider orientation="left" style={{ fontSize: 13 }}>更正流水（只可改实收金额、提成基数、备注）</Divider>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 260 }}
        dataSource={patchedEntries}
        columns={[
          { title: '单号', dataIndex: 'orderNo', width: 150, render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
          { title: '实收', width: 130, render: (_, e) => (
            <InputNumber size="small" precision={2} prefix="¥" style={{ width: 115 }}
              defaultValue={e.amount}
              status={entryPatches[e.id]?.amount !== undefined ? 'warning' : undefined}
              onChange={(v) => setEntryPatches((p) => ({ ...p, [e.id]: { ...p[e.id], amount: round2(v || 0) } }))}
            />
          ) },
          { title: '提成基数', width: 130, render: (_, e) => (
            <InputNumber size="small" precision={2} prefix="¥" style={{ width: 115 }}
              defaultValue={e.commissionBase}
              status={entryPatches[e.id]?.commissionBase !== undefined ? 'warning' : undefined}
              onChange={(v) => setEntryPatches((p) => ({ ...p, [e.id]: { ...p[e.id], commissionBase: round2(v || 0) } }))}
            />
          ) },
          { title: '备注', render: (_, e) => (
            <Input size="small" defaultValue={e.note}
              onChange={(ev) => setEntryPatches((p) => ({ ...p, [e.id]: { ...p[e.id], note: ev.target.value } }))}
            />
          ) },
        ]}
      />

      <Divider orientation="left" style={{ fontSize: 13 }}>手工对账说明</Divider>
      <Space direction="vertical" style={{ width: '100%' }}>
        {manualRows.map((m, idx) => (
          <Space key={m.id} style={{ display: 'flex' }} align="baseline">
            <Input style={{ width: 420 }} placeholder="差异原因" value={m.reason}
              onChange={(e) => setManualRows((rows) => rows.map((x, i) => i === idx ? { ...x, reason: e.target.value } : x))} />
            <InputNumber style={{ width: 150 }} precision={2} prefix="¥" value={m.amount}
              onChange={(v) => setManualRows((rows) => rows.map((x, i) => i === idx ? { ...x, amount: round2(v || 0) } : x))} />
            <Button type="link" danger size="small" icon={<DeleteOutlined />}
              onClick={() => setManualRows((rows) => rows.filter((x) => x.id !== m.id))}>删除</Button>
          </Space>
        ))}
        <Button size="small" icon={<PlusOutlined />}
          onClick={() => setManualRows((rows) => [...rows, { id: genManualDiffId(), reason: '', amount: 0 }])}>
          新增说明
        </Button>
      </Space>

      <Divider orientation="left" style={{ fontSize: 13 }}>结账单备注</Divider>
      <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />

      <Divider style={{ margin: '12px 0' }} />
      <Descriptions column={3} size="small">
        <Descriptions.Item label="改后实收">{formatCurrency(preview.received)}</Descriptions.Item>
        <Descriptions.Item label="改后提成基数">{formatCurrency(preview.base)}</Descriptions.Item>
        <Descriptions.Item label="未解释差异">
          {Math.abs(preview.unexplained) < 0.01
            ? <Text type="success">0（对得上）</Text>
            : <Text type="danger">{formatCurrency(preview.unexplained)}</Text>}
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
};

export default DetailPage;
