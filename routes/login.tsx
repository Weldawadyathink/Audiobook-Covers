import { define } from "../utils.ts";

export default define.page(() => {
  return (
    <form
      class="flex flex-col gap-6 max-w-64"
      method="post"
      action="/api/login"
    >
      <label for="username">Username</label>
      <input type="text" name="username" />
      <label for="password">Password</label>
      <input type="password" name="password" />
      <button type="submit">Submit</button>
    </form>
  );
});
