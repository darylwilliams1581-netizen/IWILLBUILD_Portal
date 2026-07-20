import{createRequire as o}from"module";import{j as e}from"./radix-ui-DB7-u4XC.js";import{T as i}from"../server.bundle.mjs";import{u as a,b as s}from"./react-router-5dh9OgMp.js";const m=o(import.meta.url);function p(){const t=a(),r=s().pathname.startsWith("/fleet");return e.jsx("button",{onClick:()=>t("/fleet"),title:"Fleet","aria-label":"Go to Fleet",className:`
        flex items-center justify-center w-9 h-9 rounded-lg transition-colors
        ${r?"bg-primary/10 text-primary":"text-muted-foreground hover:text-foreground hover:bg-muted"}
      `,children:e.jsx(i,{size:18})})}export{p as F};
