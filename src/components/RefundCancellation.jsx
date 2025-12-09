import React from "react";
import Policy from "./Policy.jsx";
import { refund } from "../policies/content.js";

export default function RefundCancellation({onBack}){
  return <Policy title="Refund & Cancellation Policy" content={refund} onBack={onBack}/>;
}

