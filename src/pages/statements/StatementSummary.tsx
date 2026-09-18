import React from 'react';
import { Row, Col, Card, Table, Tag, Input, Statistic } from 'antd';
import { PayCircleOutlined, WalletOutlined, CreditCardOutlined, GiftOutlined } from '@ant-design/icons';
import type { DailyStatement, CommissionEntry, Employee } from '../../types';
import { formatCurrency, getStatusText } from '../../utils/format';

interface StatementSummaryProps {
  statement: DailyStatement;
  employees: Employee[];
  editable?: boolean;
  onCommissionsChange?: (commissions: CommissionEntry[]) => void;
  onRemarkChange?: (remark: string) => void;
}

const StatementSummary: React.FC<StatementSummaryProps> = ({
  statement,
  employees,
  editable = false,
  onCommissionsChange,
  onRemarkChange
}) => {
  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name || id;

  const handleDiffNoteChange = (employeeId: string, note: string) => {
    if (!onCommissionsChange) return;
    onCommissionsChange(
      statement.commissions.map((c) => (c.employeeId === employeeId ? { ...c, diffNote: note } : c))
    );
  };

  const methodCards = [
    { key: 'cash', icon: <WalletOutlined />, color: '#52c41a' },
    { key: 'card', icon: <CreditCardOutlined />, color: '#1677ff' },
    { key: 'voucher', icon: <GiftOutlined />, color: '#fa8c16' }
  ] as const;

  return (
    <div>
      <Row gutter={[16, 16]}>
        {methodCards.map((m) => (
          <Col xs={12} md={4} key={m.key}>
            <Card className="card-wrapper" bordered={false}>
              <Statistic
                title={
                  <span>
                    {m.icon} {getStatusText(m.key)}
                  </span>
                }
                value={statement.byMethod[m.key]}
                precision={2}
                prefix="¥"
                valueStyle={{ color: m.color, fontSize: 20 }}
              />
            </Card>
          </Col>
        ))}
        <Col xs={12} md={4}>
          <Card className="card-wrapper" bordered={false}>
            <Statistic
              title="收款合计"
              value={statement.totalIncome}
              precision={2}
              prefix="¥"
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="card-wrapper" bordered={false}>
            <Statistic
              title="退款冲减"
              value={statement.totalRefund}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#ff4d4f', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="card-wrapper" bordered={false}>
            <Statistic
              title={
                <span>
                  <PayCircleOutlined /> 净收入
                </span>
              }
              value={statement.netIncome}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#C9A86C', fontSize: 20, fontWeight: 600 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card className="card-wrapper" title="按项目分类汇总" bordered={false}>
            <Table
              size="small"
              rowKey="category"
              pagination={false}
              dataSource={statement.byCategory}
              columns={[
                { title: '项目分类', dataIndex: 'category' },
                { title: '笔数', dataIndex: 'count', width: 70, align: 'center' },
                {
                  title: '金额',
                  dataIndex: 'amount',
                  align: 'right',
                  render: (v: number) => (
                    <span style={v < 0 ? { color: '#ff4d4f' } : undefined}>{formatCurrency(v)}</span>
                  )
                }
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <strong>合计</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center">
                    <strong>{statement.byCategory.reduce((s, c) => s + c.count, 0)}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <strong>{formatCurrency(statement.netIncome)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            className="card-wrapper"
            title="美容师提成对账"
            bordered={false}
            extra={<Tag color="gold">差异须填写说明</Tag>}
          >
            <Table
              size="small"
              rowKey="employeeId"
              pagination={false}
              dataSource={statement.commissions}
              rowClassName={(c) => (c.diff !== 0 ? 'statement-diff-row' : '')}
              columns={[
                {
                  title: '美容师',
                  dataIndex: 'employeeId',
                  render: (id: string) => employeeName(id)
                },
                {
                  title: '提成基数(应收)',
                  dataIndex: 'listBase',
                  align: 'right',
                  render: (v: number) => formatCurrency(v)
                },
                {
                  title: '实收金额',
                  dataIndex: 'received',
                  align: 'right',
                  render: (v: number) => formatCurrency(v)
                },
                {
                  title: '差异',
                  dataIndex: 'diff',
                  align: 'right',
                  render: (v: number) =>
                    v === 0 ? (
                      <Tag color="green">相符</Tag>
                    ) : (
                      <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{formatCurrency(v)}</span>
                    )
                },
                {
                  title: '差异说明',
                  dataIndex: 'diffNote',
                  width: 220,
                  render: (note: string, record) =>
                    editable ? (
                      <Input
                        size="small"
                        placeholder={record.diff !== 0 ? '必填：说明差异原因' : '无差异可不填'}
                        status={record.diff !== 0 && !note.trim() ? 'error' : ''}
                        value={note}
                        onChange={(e) => handleDiffNoteChange(record.employeeId, e.target.value)}
                      />
                    ) : (
                      note || <span style={{ color: '#bfbfbf' }}>—</span>
                    )
                }
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card className="card-wrapper" title="备注" bordered={false} style={{ marginTop: 16 }}>
        {editable ? (
          <Input.TextArea
            rows={2}
            placeholder="结账单备注（可选）"
            value={statement.remark}
            onChange={(e) => onRemarkChange?.(e.target.value)}
          />
        ) : (
          <span>{statement.remark || '无'}</span>
        )}
      </Card>
    </div>
  );
};

export default StatementSummary;
