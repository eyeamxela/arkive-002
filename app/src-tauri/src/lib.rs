mod personal;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(personal::PersonalNode::default())
    .invoke_handler(tauri::generate_handler![personal::personal_node_connection, personal::pick_brain_folder])
    .build(tauri::generate_context!())
    .expect("error while building arkive")
    .run(|app, event| {
      if matches!(event, tauri::RunEvent::Exit) {
        app.state::<personal::PersonalNode>().stop();
      }
    });
}
