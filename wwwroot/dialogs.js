(() => {
  const outside = (dialog, event) => {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom;
  };

  document.querySelectorAll('dialog').forEach(dialog => {
    let backdropPress = false;
    dialog.addEventListener('pointerdown', event => {
      // Remember where the gesture began: a selection or drag out of the
      // dialog must never become a backdrop dismissal.
      backdropPress = dialog.open && event.target === dialog &&
        event.button === 0 && event.isPrimary !== false && outside(dialog, event);
    });
    dialog.addEventListener('click', event => {
      const dismiss = backdropPress && dialog.open && event.target === dialog &&
        event.button === 0 && event.detail > 0 && outside(dialog, event);
      backdropPress = false;
      if (dismiss) dialog.close();
    });
    dialog.addEventListener('pointercancel', () => { backdropPress = false; });
    dialog.addEventListener('close', () => { backdropPress = false; });
    new MutationObserver(records => {
      backdropPress = false;
      // Only opening resets scroll; replacing body content during refresh
      // leaves the reader at their current position.
      if (dialog.open && records.some(record => record.oldValue === null)) {
        requestAnimationFrame(() => {
          if (dialog.open) {
            const body = dialog.querySelector('.dialog-body');
            if (body) body.scrollTop = 0;
          }
        });
      }
    }).observe(dialog, { attributes: true, attributeFilter: ['open'], attributeOldValue: true });
  });
})();
