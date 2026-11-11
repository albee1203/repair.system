(() => {
  const form = document.querySelector("#repair-form");
  const submit = document.querySelector("#submit-repair");
  const refresh = document.querySelector("#refresh-list");
  const formMessage = document.querySelector("#form-message");
  const listMessage = document.querySelector("#list-message");
  const filterMessage = document.querySelector("#filter-message");
  const list = document.querySelector("#repair-list");
  const filterButtons = document.querySelectorAll("[data-urgency-filter]");
  const template = document.querySelector("#repair-item");
  const table = "repair_requests";
  const formFields = ["reporter_name", "location", "category", "description", "urgency"];
  const listFields = [...formFields, "status", "created_at"];
  const dateFormat = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" });
  let client;
  let submitting = false;
  let listRequest = 0;
  let recentRequests = null;
  let selectedUrgency = "";

  function showMessage(target, message, kind = "") {
    target.textContent = message;
    target.dataset.kind = kind;
  }

  function renderRequests(records) {
    const items = records.map((record) => {
      const item = template.content.cloneNode(true);
      for (const field of listFields) {
        const node = item.querySelector(`[data-field="${field}"]`);
        if (field === "created_at") {
          node.dateTime = record.created_at;
          node.textContent = dateFormat.format(new Date(record.created_at));
        } else {
          node.textContent = record[field];
        }
      }
      item.querySelector(".urgency").classList.toggle("urgency-high", record.urgency === "高");
      return item;
    });
    list.replaceChildren(...items);
  }

  function renderFilteredRequests() {
    if (recentRequests === null) return;
    const visibleRequests = selectedUrgency
      ? recentRequests.filter((record) => record.urgency === selectedUrgency)
      : recentRequests;
    renderRequests(visibleRequests);
    showMessage(filterMessage, visibleRequests.length
      ? ""
      : selectedUrgency ? "最近 20 筆沒有符合此緊急程度的報修。" : "目前沒有報修紀錄。");
  }

  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      selectedUrgency = button.dataset.urgencyFilter;
      for (const option of filterButtons) {
        option.setAttribute("aria-pressed", String(option === button));
      }
      renderFilteredRequests();
    });
  }

  async function loadRequests() {
    const request = ++listRequest;
    refresh.disabled = true;
    list.setAttribute("aria-busy", "true");
    showMessage(listMessage, "正在載入報修清單…");
    try {
      const { data, error } = await client.from(table)
        .select(listFields.join(","))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20);
      if (request !== listRequest) return;
      if (error) throw error;
      recentRequests = data;
      renderFilteredRequests();
      showMessage(listMessage, "");
    } catch {
      if (request === listRequest) {
        showMessage(listMessage, "無法更新報修清單，請稍後重新整理。", "error");
      }
    } finally {
      if (request === listRequest) {
        list.removeAttribute("aria-busy");
        refresh.disabled = false;
      }
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client || submitting) return;

    const values = new FormData(form);
    const record = Object.fromEntries(formFields.map((field) => [field, values.get(field).trim()]));
    const blankField = formFields.find((field) => !record[field]);
    if (blankField) {
      showMessage(formMessage, "請填寫所有欄位，文字欄位不可只有空白。", "error");
      form.elements.namedItem(blankField).focus();
      return;
    }

    submitting = true;
    submit.disabled = true;
    for (const field of formFields) form.elements.namedItem(field).disabled = true;
    showMessage(formMessage, "正在送出…");
    try {
      const { error } = await client.from(table).insert(record);
      if (error) throw error;
      form.reset();
      showMessage(formMessage, "報修已送出。", "success");
      void loadRequests();
    } catch {
      showMessage(formMessage, "未能確認送出結果。請先重新整理清單，再視需要重送。", "error");
    } finally {
      for (const field of formFields) form.elements.namedItem(field).disabled = false;
      submit.disabled = false;
      submitting = false;
    }
  });

  try {
    const { url, publishableKey } = window.repairConfig;
    client = window.supabase.createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch {
    showMessage(formMessage, "無法啟動報修服務，請重新載入網頁。", "error");
    showMessage(listMessage, "報修清單暫時無法載入。", "error");
    return;
  }

  submit.disabled = false;
  refresh.addEventListener("click", loadRequests);
  void loadRequests();
})();
