import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function AuditLog() {
  return (
    <div>
      <PageHeader title="AuditLog" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
