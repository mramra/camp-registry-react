import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function Analysis() {
  return (
    <div>
      <PageHeader title="Analysis" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
