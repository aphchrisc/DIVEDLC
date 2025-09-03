(() => {
  const form = document.getElementById('suggest-form');
  if (!form) return;

  const urlInput = document.getElementById('suggest-url');
  const sectionInput = document.getElementById('suggest-section');
  const statusEl = document.getElementById('suggest-status');
  const captchaLabel = document.getElementById('captcha-label');
  const captchaAnswer = document.getElementById('captcha-answer');
  let captchaSum = 0;

  function newCaptcha() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    captchaSum = a + b;
    captchaLabel.textContent = `What is ${a} + ${b}?`;
    captchaAnswer.value = '';
  }

  newCaptcha();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.textContent = '';
    if (parseInt(captchaAnswer.value, 10) !== captchaSum) {
      statusEl.textContent = 'Captcha incorrect.';
      newCaptcha();
      return;
    }

    const entry = {
      url: urlInput.value.trim(),
      section: sectionInput.value.trim(),
      type: form.querySelector('input[name="suggest-type"]:checked').value,
      date: new Date().toISOString()
    };

    try {
      await saveSuggestion(entry);
      statusEl.textContent = 'Thanks! Submission recorded.';
      form.reset();
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Error saving suggestion.';
    }
    newCaptcha();
  });

  async function saveSuggestion(entry) {
    const owner = document.body.dataset.ghOwner;
    const repo = document.body.dataset.ghRepo;
    const token = localStorage.getItem('dive:gh_token');
    if (!owner || !repo || !token) {
      throw new Error('Missing configuration');
    }
    const path = 'assets/data/suggestions.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const getResp = await fetch(apiUrl, { headers: { Authorization: `token ${token}` } });
    if (!getResp.ok) throw new Error('Failed to fetch suggestions file');
    const file = await getResp.json();
    const current = file.content ? JSON.parse(atob(file.content)) : [];
    current.push(entry);
    const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(current, null, 2))));
    const body = {
      message: 'Add suggestion',
      content: newContent,
      sha: file.sha
    };
    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!putResp.ok) throw new Error('Failed to update suggestions file');
  }
})();
