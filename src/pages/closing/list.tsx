import React, { useMemo, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  DatePicker,
  Typography,
  Row,
  Col,
  Statistic,
  Popconfirm,
  message,
  Empty,
  Tooltip,
} from 'antd';
import {
  FileAddOutlined,
  PlusOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { RootState } from '../../store';
import { store, deleteDraftStatement, upsertDraftStatement } from '../../store';
import type { ClosingStatement, PaymentEntry } from '../../types';
import PaymentModal from './PaymentModal';
import {
  PAYMENT_COLOR,
  PAYMENT_LABEL,
  localDateOf,
} from '../../utils/closing';
import { formatCurrency } from '../../utils/format';

const { Text } = Typography;

const statusTag = (s: ClosingStatement) => {
  if (s.status === 'draft') return <Tag color="orange">草稿待确认</Tag>;
  if (s.type === 'supplement') return <Tag color="geekblue">补单·已留档</Tag>;
  return <Tag color="green">已确认留档</Tag>;
};

const ClosingListPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const state = useSelector((s: RootState) => s.app);
  const today = localDateOf(new Date());

  const [modalOpen, setModalOpen] = useState(false);
  const [filterDate, setFilterDate] = useState<string>(today);

  const unlocked = useMemo(
    () =>
      state.paymentEntries
        .filter((e) => !e.statementId && e.businessDate === filterDate)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [state.paymentEntries, filterDate]
  );

  const statements = useMemo(
    () =>
      state.closingStatements
        .filter((s) => s.businessDate === filterDate)
        .sort((a, b) => b.seq - a.seq),
    [state.closingStatements, filterDate]
  );

  const unlockedTotals = useMemo(() => {
    const sum = (m?: PaymentEntry['method']) =>
      unlocked
        .filter((e) => (m ? e.method === m : true))
        .reduce((s, e) => s + e.amount, 0);
    return {
      cash: sum('cash'),
      card: sum('card'),
      voucher: sum('voucher'),
      total: sum(),
      base: unlocked.reduce((s, e) => s + e.commissionBase, 0),
    };
  }, [unlocked]);

  const hasConfirmed = statements.some((s) => s.status === 'confirmed');

  const handleCreateStatement = () => {
    try {
      dispatch(upsertDraftStatement({ businessDate: filterDate }));
      const draft = store
        .getState()
        .app.closingStatements.find(
          (s) => s.businessDate === filterDate && s.status === 'draft'
        );
      message.success(hasConfirmed ? '已另起一张补单草稿' : '结账单草稿已生成');
      navigate(`/closing/${draft?.id ?? ''}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const entryColumns: ColumnsType<PaymentEntry> = [
    { title: '单号', dataIndex: 'orderNo', width: 180, render: (v, r) => (
      <Space direction="vertical" size={0}>
        <Text style={{ fontSize: 12 }}>{v}</Text>
        {r.refOrderNo && <Text type="warning" style={{ fontSize: 11 }}>冲减原单 {r.refOrderNo}</Text>}
      </Space>
    ) },
    {
      title: '时间',
      dataIndex: 'receivedAt',
      width: 100,
      render: (v: string) => dayjs(v).format('HH:mm'),
    },
    {
      title: '顾客 / 项目',
      render: (_, r) => {
        const c = state.customers.find((x) => x.id === r.customerId);
        const svc = state.services.find((x) => x.id === r.serviceId);
        return (
          <Space direction="vertical" size={0}>
            <Text>{c?.name || '—'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{svc?.name || r.category}</Text>
          </Space>
        );
      },
    },
    {
      title: '美容师',
      width: 90,
      render: (_, r) => state.employees.find((x) => x.id === r.employeeId)?.name || '—',
    },
    {
      title: '方式',
      dataIndex: 'method',
      width: 80,
      render: (m: PaymentEntry['method']) => <Tag color={PAYMENT_COLOR[m]}>{PAYMENT_LABEL[m]}</Tag>,
    },
    {
      title: '实收',
      dataIndex: 'amount',
      width: 110,
      align: 'right',
      render: (v: number) => (
        <Text type={v < 0 ? 'danger' : undefined} strong>{formatCurrency(v)}</Text>
      ),
    },
    {
      title: '提成基数',
      dataIndex: 'commissionBase',
      width: 110,
      align: 'right',
      render: (v: number) => formatCurrency(v),
    },
    { title: '备注', dataIndex: 'note', width: 180, ellipsis: true, render: (v) => v || '—' },
  ];

  const stmtColumns: ColumnsType<ClosingStatement> = [
    {
      title: '结账单号',
      dataIndex: 'no',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          {r.type === 'supplement' && <Text type="secondary" style={{ fontSize: 11 }}>确认后补单</Text>}
        </Space>
      ),
    },
    { title: '流水笔数', dataIndex: ['totals', 'count'], width: 90, align: 'center' },
    {
      title: '现金',
      dataIndex: ['totals', 'cash'],
      width: 110,
      align: 'right',
      render: (v: number) => formatCurrency(v),
    },
    {
      title: '刷卡',
      dataIndex: ['totals', 'card'],
      width: 110,
      align: 'right',
      render: (v: number) => formatCurrency(v),
    },
    {
      title: '券',
      dataIndex: ['totals', 'voucher'],
      width: 110,
      align: 'right',
      render: (v: number) => formatCurrency(v),
    },
    {
      title: '实收合计',
      dataIndex: ['totals', 'totalReceived'],
      width: 120,
      align: 'right',
      render: (v: number) => <Text strong>{formatCurrency(v)}</Text>,
    },
    {
      title: '提成基数合计',
      dataIndex: ['totals', 'commissionBase'],
      width: 130,
      align: 'right',
      render: (v: number) => formatCurrency(v),
    },
    {
      title: '对账',
      width: 90,
      align: 'center',
      render: (_, r) =>
        r.reconciliation.balanced ? (
          <Tag color="green">对得上</Tag>
        ) : (
          <Tooltip title={r.reconciliation.unexplained.toFixed(2)}>
            <Tag color="red">有差异</Tag>
          </Tooltip>
        ),
    },
    {
      title: '状态',
      width: 120,
      render: (_, r) => statusTag(r),
    },
    {
      title: '确认时间',
      width: 160,
      render: (_, r) =>
        r.confirmedAt ? dayjs(r.confirmedAt).format('YYYY-MM-DD HH:mm') : <Text type="secondary">未确认</Text>,
    },
    {
      title: '操作',
      width: 140,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" onClick={() => navigate(`/closing/${r.id}`)}>
            {r.status === 'draft' ? '去确认' : '查看留档'}
          </Button>
          {r.status === 'draft' && (
            <Popconfirm
              title="删除这张草稿？"
              onConfirm={() => {
                dispatch(deleteDraftStatement({ id: r.id }));
                message.success('草稿已删除');
              }}
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">每日结账</h1>
          <p className="page-header-subtitle">关店前出结账单：按收款方式与项目分类汇总，提成基数与实收核对留档</p>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            登记收款 / 退单
          </Button>
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={handleCreateStatement}
            disabled={unlocked.length === 0}
          >
            {hasConfirmed ? '补一笔 · 另起补单' : '生成当日结账单'}
          </Button>
        </Space>
      </div>

      <Card bordered={false} className="card-wrapper" style={{ marginBottom: 16 }}>
        <Space size="middle" wrap>
          <Text strong>营业日：</Text>
          <DatePicker
            value={dayjs(filterDate)}
            allowClear={false}
            onChange={(d) => d && setFilterDate(d.format('YYYY-MM-DD'))}
            disabledDate={(d) => d && d.isAfter(dayjs().endOf('day'))}
          />
          {filterDate === today ? (
            <Tag color="green">今天</Tag>
          ) : (
            <Tag>{filterDate < today ? '历史营业日' : ''}</Tag>
          )}
          {hasConfirmed && unlocked.length > 0 && (
            <Tag icon={<CopyOutlined />} color="geekblue">
              当日已确认过结账单，新增的 {unlocked.length} 笔将另起补单，不并回原单
            </Tag>
          )}
        </Space>
      </Card>

      <Card
        bordered={false}
        className="card-wrapper"
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <AuditOutlined />
            <span>未结账流水（{unlocked.length} 笔）</span>
          </Space>
        }
        extra={<Text type="secondary" style={{ fontSize: 12 }}>确认后的结账单会锁定对应流水</Text>}
      >
        {unlocked.length > 0 ? (
          <>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={5}><Statistic title="现金" value={unlockedTotals.cash} precision={2} prefix="¥" valueStyle={{ color: '#C9A86C' }} /></Col>
              <Col span={5}><Statistic title="刷卡" value={unlockedTotals.card} precision={2} prefix="¥" valueStyle={{ color: '#3b7dd8' }} /></Col>
              <Col span={5}><Statistic title="券" value={unlockedTotals.voucher} precision={2} prefix="¥" valueStyle={{ color: '#9254de' }} /></Col>
              <Col span={5}><Statistic title="实收合计" value={unlockedTotals.total} precision={2} prefix="¥" /></Col>
              <Col span={4}><Statistic title="提成基数" value={unlockedTotals.base} precision={2} prefix="¥" /></Col>
            </Row>
            <Table
              rowKey="id"
              columns={entryColumns}
              dataSource={unlocked}
              pagination={false}
              size="small"
            />
          </>
        ) : (
          <Empty description="该营业日没有未结账的流水" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      <Card
        bordered={false}
        className="card-wrapper"
        title={
          <Space>
            <CheckCircleOutlined />
            <span>结账单留档</span>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={stmtColumns}
          dataSource={statements}
          pagination={false}
          size="middle"
          locale={{ emptyText: <Empty description="该营业日还没有结账单" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>

      <PaymentModal open={modalOpen} onClose={() => setModalOpen(false)} defaultBusinessDate={today} />
    </div>
  );
};

export default ClosingListPage;
