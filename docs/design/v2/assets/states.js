// State picker for the v2 design pages. The element with data-states="id:Label,..." lists a page's states;
// elements with data-when="id other" show only in those states, and [data-invalid-in="id"] gets aria-invalid.
// The current state lives in the URL hash so a state can be linked to directly.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('[data-states]');
    var picker = document.getElementById('state-picker');
    if (!root || !picker) return;
    var states = root.dataset.states.split(',').map(function (pair) { return pair.split(':'); });

    function set(state) {
      document.querySelectorAll('[data-when]').forEach(function (el) {
        el.classList.toggle('on', el.dataset.when.split(' ').indexOf(state) !== -1);
      });
      document.querySelectorAll('[data-invalid-in]').forEach(function (el) {
        if (el.dataset.invalidIn === state) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      });
      picker.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.state === state)); });
      history.replaceState(null, '', '#' + state);
    }

    states.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.state = s[0]; b.textContent = s[1];
      b.addEventListener('click', function () { set(s[0]); });
      picker.appendChild(b);
    });
    // Any element with data-go="state" acts as a prototype link to that state.
    document.addEventListener('click', function (event) {
      var go = event.target.closest('[data-go]');
      if (go) { event.preventDefault(); set(go.dataset.go); window.scrollTo(0, 0); }
    });
    var initial = location.hash.slice(1);
    set(states.some(function (s) { return s[0] === initial; }) ? initial : states[0][0]);
  });
})();
