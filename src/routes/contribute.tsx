import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/contribute')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/contribute"!</div>
}
