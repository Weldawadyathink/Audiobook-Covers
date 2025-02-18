import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Input } from "../../components/ui/Input.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { z } from "zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "../../components/ui/Form.tsx";
import { zodResolver } from "@hookform/resolvers/zod";

export const Route = createFileRoute("/image/search")({
  component: RouteComponent,
});

const formSchema = z.object({
  q: z.string().trim().min(1),
});

function RouteComponent() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      q: "",
    },
  });

  const navigate = useNavigate();

  function onSubmit(values: z.infer<typeof formSchema>) {
    // setQuery(values.q);
    console.log(`Performing navigation to ${values.q}`);
    navigate({
      to: "/image/search/$searchString",
      params: { searchString: values.q },
    });
  }

  return (
    <div className="mx-6">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-row justify-center gap-6"
        >
          <FormField
            control={form.control}
            name="q"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    className="w-auto max-w-80 text-black"
                    placeholder="Enter a search term..."
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
        </form>
      </Form>
      <Outlet />
    </div>
  );
}
