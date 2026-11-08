// Menu-bar icon: always visible, even while the overlay is hidden.
// Left-click = hide / show Beast at once. Right-click = menu with timed hides
// (it comes back by itself) and Quit.
use crate::shortcuts;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide Beast   (⌘\\)", true, None::<&str>)?;
    let h1 = MenuItem::with_id(app, "hide_60", "Hide for 1 minute", true, None::<&str>)?;
    let h5 = MenuItem::with_id(app, "hide_300", "Hide for 5 minutes", true, None::<&str>)?;
    let h15 = MenuItem::with_id(app, "hide_900", "Hide for 15 minutes", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Beast", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&toggle, &sep1, &h1, &h5, &h15, &sep2, &quit])?;

    TrayIconBuilder::with_id("beast-tray")
        .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
        .tooltip("Beast — click to hide / show")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => shortcuts::toggle_main_window(app.clone()),
            "hide_60" => shortcuts::hide_main_window_for(app.clone(), 60),
            "hide_300" => shortcuts::hide_main_window_for(app.clone(), 300),
            "hide_900" => shortcuts::hide_main_window_for(app.clone(), 900),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                shortcuts::toggle_main_window(tray.app_handle().clone());
            }
        })
        .build(app)?;
    Ok(())
}
