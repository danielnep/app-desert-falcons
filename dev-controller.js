(() => {

  "use strict";

  const KEY =
    "event_dev_controller_v1";

  const DEFAULT = {
    enabled:false,
    role:"player"
  };

  let state = load();

  function load(){

    try{

      return Object.assign(
        {},
        DEFAULT,
        JSON.parse(
          localStorage.getItem(KEY)
          || "{}"
        )
      );

    }catch{

      return {
        ...DEFAULT
      };

    }

  }

  function save(){

    localStorage.setItem(
      KEY,
      JSON.stringify(state)
    );

  }

  function getRole(){

    return state.enabled
      ? state.role
      : "player";

  }

  function setRole(role){

    if(
      role !== "player" &&
      role !== "organizer"
    ){
      return;
    }

    state.role =
      role;

    save();

    render();

  }

  function setEnabled(enabled){

    state.enabled =
      !!enabled;

    if(!state.enabled){

      state.role =
        "player";

    }

    save();

    render();

  }

  function getState(){

    return {

      enabled:
        state.enabled,

      role:
        getRole()

    };

  }

  function render(){

    document.body.dataset.dev =
      state.enabled
        ? "on"
        : "off";

    document.body.dataset.role =
      getRole();

    const mainState =
      document.getElementById(
        "devModeState"
      );

    if(mainState){

      mainState.textContent =
        state.enabled
          ? `HABILITADO · ${getRole().toUpperCase()}`
          : "DESABILITADO";

    }

    const panelState =
      document.getElementById(
        "devPanelState"
      );

    if(panelState){

      panelState.textContent =
        state.enabled
          ? `HABILITADO · ${getRole().toUpperCase()}`
          : "DESABILITADO";

    }

    const checkbox =
      document.getElementById(
        "devEnabled"
      );

    if(checkbox){

      checkbox.checked =
        state.enabled;

    }

    const player =
      document.getElementById(
        "devPlayer"
      );

    const organizer =
      document.getElementById(
        "devOrganizer"
      );

    player?.classList.toggle(
      "active",
      getRole() === "player"
    );

    organizer?.classList.toggle(
      "active",
      getRole() === "organizer"
    );

    const readout =
      document.getElementById(
        "devReadout"
      );

    if(readout){

      readout.textContent =
        JSON.stringify(
          {
            enabled:
              state.enabled,

            role:
              getRole(),

            authority:{
              mayEndEvent:
                state.enabled &&
                getRole() ===
                  "organizer"
            }

          },
          null,
          2
        );

    }

  }

  window.DFControl = {

    getRole,

    getState,

    setRole,

    setEnabled,

    render

  };

  render();

})();
