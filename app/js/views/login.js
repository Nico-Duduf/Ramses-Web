export function loginView(store) {
  return {
    email: "",
    password: "",
    /** Which server this is. Two people, one laptop and a phone: worth being
     * unambiguous about where credentials are going. */
    host: window.location.host,
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
