import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function Alerts() {
  return (
    <div>
      <PageHeader title="Alerts" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
