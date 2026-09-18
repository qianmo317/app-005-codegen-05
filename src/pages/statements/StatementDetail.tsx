import React from 'react';
import { Drawer, Descriptions, Tag, Table, Timeline, Empty, Divider } from 'antd';
import type { DailyStatement, Payment, Employee, Service, Customer } from '../../types';
import { formatCurrency, formatDateTime, formatTime, getStatusText, getStatusColor } from '../../utils/format';
import StatementSummary from './StatementSummary';

interface StatementDetailProps {
  statement: DailyStatement | null;
  payments: Payment[];
  employees: Employee[];
  services: Service[];
  customers: Customer[];
  onClose: () => void;
}

const StatementDetail: React.FC<StatementDetailProps> = ({
  statement,
  payments,
  employees,
  services,
  customers,
  onClose
}) => {
  if (!statement) return null;

  const statementPayments = payments
    .filter((p) => statement.paymentIds.includes(p.id))
    .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());

  const nameOf = <T extends { id: string; name: string }>(list: T[], id: string) =>
    list.find((x) => x.id === id)?.name || id;

  return (
    <Drawer
      title={
        <span>
          结账单 {statement.statementNo}{' '}
          <Tag color={getStatusColor(statement.type)}>{getStatusText(statement.type)}</Tag>
          <Tag color={getStatusColor(statement.status)}>{getStatusText(statement.status)}</Tag>
          {statement.revisions.length > 0 && (
            <Tag color="orange">已修改 {statement.revisions.length} 次</Tag>
          )}
        </span>
      }
      width={960}
      open={!!statement}
      onClose={onClose}
    >
      <Descriptions size="small" column={4} bordered>
        <Descriptions.Item label="营业日">{statement.businessDate}</Descriptions.Item>
        <Descriptions.Item label="净收入">
          <strong style={{ color: '#C9A86C' }}>{formatCurrency(statement.netIncome)}</strong>
        </Descriptions.Item>
        <Descriptions.Item label="确认人">{statement.confirmedBy || '—'}</Descriptions.Item>
        <Descriptions.Item label="确认时间">
          {statement.confirmedAt ? formatDateTime(statement.confirmedAt) : '—'}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>
        汇总
      </Divider>
      <StatementSummary statement={statement} employees={employees} />

      <Divider orientation="left" plain>
        流水明细（{statementPayments.length} 笔）
      </Divider>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={statementPayments}
        columns={[
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
            title: '实收',
            dataIndex: 'amount',
            align: 'right',
            render: (v: number) => (
              <span style={v < 0 ? { color: '#ff4d4f' } : undefined}>{formatCurrency(v)}</span>
            )
          },
          {
            title: '备注/原因',
            render: (_, r) => r.reason || r.note || <span style={{ color: '#bfbfbf' }}>—</span>
          }
        ]}
      />

      <Divider orientation="left" plain>
        修改历史
      </Divider>
      {statement.revisions.length > 0 ? (
        <Timeline
          items={[...statement.revisions].reverse().map((rev) => ({
            color: 'orange',
            children: (
              <div key={rev.id}>
                <div style={{ marginBottom: 4 }}>
                  <strong>{rev.revisedBy}</strong>
                  <span style={{ color: '#8c8c8c', marginLeft: 8 }}>
                    {formatDateTime(rev.revisedAt)}
                  </span>
                </div>
                <div style={{ marginBottom: 4 }}>
                  修改原因：{rev.reason}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {rev.changes.map((c) => (
                    <li key={c.field}>
                      {c.label}：<del style={{ color: '#8c8c8c' }}>{c.from}</del>
                      {' → '}
                      <span style={{ color: '#C9A86C' }}>{c.to}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          }))}
        />
      ) : (
        <Empty description="确认后无修改记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Drawer>
  );
};

export default StatementDetail;
