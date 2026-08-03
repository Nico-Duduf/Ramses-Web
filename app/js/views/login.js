export function loginView(store) {
  return {
    email: "",
    password: "",
    get canSubmit() {
      return this.email.trim() !== "" && this.password !== "" && !store.busy;
    },
    async submit() {
      if (!this.canSubmit) return;
      await store.login(this.email.trim(), this.password);
      // Never keep it around, successful or not.
      this.password = "";
    },
  };
}
