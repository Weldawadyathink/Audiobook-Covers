import { createFileRoute } from "@tanstack/react-router";
import { Input } from "../../components/ui/Input.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { api } from "../../utils/trpc.tsx";
import { ImageCard } from "../../components/ImageCard.tsx";
import { Spinner } from "../../components/Spinner.tsx";
import { z } from "zod";
import { useState } from "react";
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
  const [query, setQuery] = useState("");
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      q: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setQuery(values.q);
  }

  const images = api.cover.vectorSearchWithString.useQuery({
    modelName: "Benny1923/metaclip-b16-fullcc2.5b",
    queryString: query,
  }, {
    enabled: () => query !== "",
  });

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
      {images.isLoading && <Spinner />}
      {images.isSuccess && (
        <div className="flex flex-wrap justify-center gap-6 p-12">
          {images.data.length === 0 && <p>Could not find any results</p>}
          {images.data.map((image) => (
            <ImageCard key={image.id} imageData={image} className="w-56" />
          ))}
        </div>
      )}
    </div>
  );
}
