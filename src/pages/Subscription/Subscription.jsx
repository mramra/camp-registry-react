import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function Subscription() {
  return (
    <div>
      <PageHeader title="Subscription" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
