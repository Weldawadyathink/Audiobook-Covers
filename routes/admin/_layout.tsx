import { define } from "../../utils.ts";

export default define.page((ctx) => {
  return (
    <>
      <a href="/admin">Admin Home</a>
      <ctx.Component />
    </>
  );
});
