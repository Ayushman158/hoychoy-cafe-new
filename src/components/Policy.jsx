import React from "react";

export default function Policy({title, content, onBack}){
  return (
    <section className="max-w-[800px] mx-auto px-4">
      <div className="flex items-center gap-2 mt-4"><button className="btn" onClick={onBack}>←</button><div className="font-bold">{title}</div></div>
      <div className="card mt-3 whitespace-pre-wrap text-sm leading-6">{content}</div>
    </section>
  );
}

