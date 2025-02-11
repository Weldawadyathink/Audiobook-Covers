import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/apidocs')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/apidocs"!</div>
}
