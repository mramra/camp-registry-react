import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function CampsList() {
  return (
    <div>
      <PageHeader title="CampsList" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
