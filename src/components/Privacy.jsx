import React from "react";
import Policy from "./Policy.jsx";
import { privacy } from "../policies/content.js";

export default function Privacy({onBack}){
  return <Policy title="Privacy Policy" content={privacy} onBack={onBack}/>;
}

