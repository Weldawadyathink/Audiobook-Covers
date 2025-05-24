import { define } from "../../utils.ts";
import ImageCard from "../../components/ImageCard.tsx";

export default define.page((props) => {
  props.params.id;
  return (
    <>
      <span>Show image for: {props.params.id}</span>
    </>
  );
});
