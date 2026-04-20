document.addEventListener("DOMContentLoaded", function () {
    const elements = document.querySelectorAll(".reveal-on-load, .reveal-fade");

    if (!elements.length) return;

    requestAnimationFrame(() => {
        elements.forEach((element) => {
            element.classList.add("is-visible");
        });
    });
});