import type { MouseEvent } from "react";

/*
  На iPhone първото докосване на бутон, докато полето е на фокус, затваря клавиатурата и мести
  оформлението, така че докосването се губи („трябва да натисна два пъти“). preventDefault на
  mousedown пази фокуса в полето, а click-ът си минава нормално.
*/
export const keepFocus = (e: MouseEvent) => e.preventDefault();
