import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function Movements() {
  return (
    <div>
      <PageHeader title="Movements" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
