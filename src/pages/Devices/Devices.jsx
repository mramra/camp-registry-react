import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function Devices() {
  return (
    <div>
      <PageHeader title="Devices" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
