// Shipped to every HTML page. Delegates clicks on any .gazette-trigger into a
// `gazette:update` custom event dispatched on the target figure's mount, whose
// per-figure listener (installed by the target's hydration) calls the island's
// update(arg) method. No globals, no inline handlers — the DOM id is the address.
document.addEventListener("click", (e) => {
  const trigger = e.target.closest(".gazette-trigger");
  if (!trigger) return;
  e.preventDefault();
  const fig = document.getElementById(trigger.dataset.gazetteTarget);
  const mount = fig && fig.querySelector(".gazette-mount");
  if (!mount) return;
  // data-gazette-update holds JSON built by the trigger directive; parse it so
  // the component receives a typed value (string, number, object, …). Fall back
  // to the raw string if it is not valid JSON.
  let detail;
  try {
    detail = JSON.parse(trigger.dataset.gazetteUpdate);
  } catch {
    detail = trigger.dataset.gazetteUpdate;
  }
  mount.dispatchEvent(new CustomEvent("gazette:update", { detail, bubbles: false }));
});
