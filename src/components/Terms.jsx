import React from "react";
import Policy from "./Policy.jsx";
import { terms } from "../policies/content.js";

export default function Terms({onBack}){
  return <Policy title="Terms & Conditions" content={terms} onBack={onBack}/>;
}

