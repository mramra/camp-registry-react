import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function DataPage() {
  return (
    <div>
      <PageHeader title="DataPage" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
