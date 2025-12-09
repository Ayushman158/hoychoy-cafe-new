import React from "react";
import Policy from "./Policy.jsx";
import { shipping } from "../policies/content.js";

export default function Shipping({onBack}){
  return <Policy title="Shipping Policy" content={shipping} onBack={onBack}/>;
}

