import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
