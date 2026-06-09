import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="HelpPage" />
      <Card><EmptyState title="قيد التطوير" /></Card>
    </div>
  )
}
