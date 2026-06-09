import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function UsersList() {
  return (
    <div>
      <PageHeader title="UsersList" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
