// Pack cards into the available column space while keeping DOM/keyboard order.
// Re-measure after disclosure toggles, font loading, and responsive width changes.
let observer=null,frame=0;
export function layoutEvents(root){
 observer?.disconnect();cancelAnimationFrame(frame);
 if(!globalThis.ResizeObserver)return;
 const cards=[...root.querySelectorAll('.overview-cards > .event-card')];
 const measure=()=>{
  frame=0;
  // Read all sizes before changing grid spans to avoid interleaved layout work.
  const sizes=cards.map(card=>Math.ceil(card.getBoundingClientRect().height)+22);
  cards.forEach((card,i)=>{
   const span=`span ${sizes[i]}`;
   if(card.style.gridRowEnd!==span)card.style.gridRowEnd=span;
  });
 };
 root.querySelectorAll('.overview-cards').forEach(grid=>grid.classList.add('masonry-ready'));
 measure();
 observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(measure)});
 cards.forEach(card=>observer.observe(card));
}
