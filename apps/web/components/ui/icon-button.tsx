import * as React from "react";
import { Button } from "./button";

const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ size = "icon", variant = "outline", ...props }, ref) => (
  <Button ref={ref} variant={variant} size={size} {...props} />
));
IconButton.displayName = "IconButton";

export { IconButton };
