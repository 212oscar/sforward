import os
import re
import shutil
import tkinter as tk
from tkinter import filedialog, messagebox
import pyperclip  # Ensure to install via `pip install pyperclip`
import json  # Import json module

# Define the config file path
config_file = "config.txt"
dark_mode = False  # Track the current theme mode

# Function to save window position
def save_window_position():
    with open(config_file, "r") as f:
        lines = f.readlines()
    with open(config_file, "w") as f:
        if len(lines) > 2:
            lines[2] = f"{root.winfo_x()},{root.winfo_y()}\n"
        else:
            lines.append(f"{root.winfo_x()},{root.winfo_y()}\n")
        f.writelines(lines)

# Function to load window position
def load_window_position():
    if os.path.exists(config_file):
        with open(config_file, "r") as f:
            lines = f.readlines()
            if len(lines) > 2:
                pos = lines[2].strip().split(',')
                root.geometry(f"+{pos[0]}+{pos[1]}")

def load_workspace():
    """Load the saved workspace and dark mode setting from config file if it exists."""
    global dark_mode
    if os.path.exists(config_file):
        with open(config_file, "r") as f:
            lines = f.readlines()
            if len(lines) > 0:
                workspace_var.set(lines[0].strip())
            if len(lines) > 1:
                dark_mode = lines[1].strip() == "True"
    # Apply the dark mode setting after loading
    apply_theme()
    load_window_position()  # Load window position after applying theme

def save_workspace(workspace):
    """Save the selected workspace and dark mode setting to the config file."""
    with open(config_file, "w") as f:
        f.write(f"{workspace}\n{dark_mode}\n{root.winfo_x()},{root.winfo_y()}")

def create_folder():
    # Get user inputs
    workspace = workspace_var.get()
    ue_version = ue_version_var.get().strip()
    distribution_method = distribution_method_var.get()
    app_name = app_name_var.get().strip()

    # Validate inputs
    if not workspace:
        output_label.config(text="Error: Please select a P4 workspace.", fg="red")
        return
    if not ue_version or not re.match(r'^\d+\.\d+$', ue_version):
        output_label.config(text="Error: UE Version must be in the format 'X.Y' (e.g., 4.10 or 5.0).", fg="red")
        return
    if not distribution_method:
        output_label.config(text="Error: Please select a distribution method.", fg="red")
        return
    if not app_name:
        output_label.config(text="Error: Please enter the App Name.", fg="red")
        return
    if " " in app_name:
        output_label.config(text="Error: App Name must not contain spaces.", fg="red")
        return

    # Save the workspace path and dark mode preference for future sessions
    save_workspace(workspace)

    # Determine UE content variable
    ue5orue4 = "UE5-UserContent" if float(ue_version) >= 5.0 else "UE4-UserContent"

    # Create folder structure
    folder_path = os.path.join(workspace, ue5orue4, ue_version, distribution_method, app_name)
    try:
        os.makedirs(folder_path, exist_ok=True)
        os.startfile(folder_path)  # Open folder in Windows Explorer
        output_label.config(text=f"Folder created and opened: {folder_path}", fg="green")
    except Exception as e:
        output_label.config(text=f"Error: {e}", fg="red")

def clear_fields():
    ue_version_var.set("")
    distribution_method_var.set("AssetPacks")  # Reset to default value
    app_name_var.set("")
    output_label.config(text="")  # Clear the output label

def browse_workspace():
    folder_selected = filedialog.askdirectory(title="Select P4 Workspace")
    if folder_selected:
        workspace_var.set(folder_selected)
        save_workspace(folder_selected)  # Save the selected workspace and dark mode preference

def clear_workspace():
    """Clear only the second-level folders within each content directory after confirmation."""
    workspace = workspace_var.get()
    if not workspace:
        messagebox.showerror("Error", "No P4 workspace selected.")
        return

    response = messagebox.askyesno(
        "Warning",
        "This will delete specific subdirectories in your P4V workspace.\n"
        "Make sure there are no pending changelists in P4V to be submitted.\n"
        "Are you sure you want to continue?"
    )

    if not response:
        return

    try:
        # Define paths for UE4 and UE5 UserContent
        source1 = os.path.join(workspace, "UE4-UserContent")
        source2 = os.path.join(workspace, "UE5-UserContent")

        # Function to delete only second-level directories
        def clear_second_level_directories(path):
            if os.path.exists(path):
                for first_level_dir in os.listdir(path):
                    first_level_path = os.path.join(path, first_level_dir)
                    if os.path.isdir(first_level_path):
                        for second_level_dir in os.listdir(first_level_path):
                            second_level_path = os.path.join(first_level_path, second_level_dir)
                            if os.path.isdir(second_level_path):
                                # Delete contents within the second-level directory
                                for root, dirs, files in os.walk(second_level_path, topdown=False):
                                    for name in files:
                                        file_path = os.path.join(root, name)
                                        try:
                                            os.chmod(file_path, 0o777)  # Make file writable
                                            os.remove(file_path)
                                        except Exception as e:
                                            output_label.config(text=f"Error deleting file {file_path}: {e}", fg="red")
                                    for name in dirs:
                                        dir_path = os.path.join(root, name)
                                        try:
                                            shutil.rmtree(dir_path)
                                        except Exception as e:
                                            output_label.config(text=f"Error deleting directory {dir_path}: {e}", fg="red")

        # Clear contents in both UE4 and UE5 content directories
        clear_second_level_directories(source1)
        clear_second_level_directories(source2)

        output_label.config(text=f"P4V workspace cleared in: {workspace}", fg="green")

    except Exception as e:
        output_label.config(text=f"Error clearing workspace: {e}", fg="red")

def get_horde_info():
    # Gather input values
    app_name = app_name_var.get().strip()
    distribution_method = distribution_method_var.get()
    ue_version = ue_version_var.get().strip()
    
    # Ensure all fields are filled
    if not app_name or not distribution_method or not ue_version:
        messagebox.showerror("Error", "Please ensure all fields are filled out.")
        return

    # Determine the custom engine version if needed
    custom_engine_versions = {
        "4.20": "4.20.3-4369336+++UE4+Release-4.20",
        "4.21": "4.21.2-4753647+++UE4+Release-4.21",
        "4.22": "4.22.3-7053642+++UE4+Release-4.22",
        "4.23": "4.23.1-9631420+++UE4+Release-4.23",
        "4.24": "4.24.3-11590370+++UE4+Release-4.24",
        "4.25": "4.25.4-14469661+++UE4+Release-4.25",
        "4.26": "4.26.2-14830424+++UE4+Release-4.26",
        "4.27": "4.27.0-17155196+++UE4+Release-4.27",
        "5.0": "5.0.0-19505902+++UE5+Release-5.0",
        "5.1": "5.1.0-23058290+++UE5+Release-5.1",
        "5.2": "5.2.0-25360045+++UE5+Release-5.2",
        "5.3": "5.3.0-27405482+++UE5+Release-5.3",
        "5.4": "5.4.0-33043543+++UE5+Release-5.4",
        "5.5": "5.5.0-37670630+++UE5+Release-5.5"
    }

    custom_engine_version = custom_engine_versions.get(ue_version, "")

    # Format info for Tampermonkey script
    info = f"App Name: {app_name}\nDistribution Method: {distribution_method}\nEarliest UE Version: {ue_version}\nCustom Engine Version: {custom_engine_version}"
    pyperclip.copy(info)  # Copy to clipboard
    messagebox.showinfo("Copied", "Info copied to clipboard. Paste it into the Tampermonkey script.")

def get_data_from_clipboard():
    try:
        data = pyperclip.paste()
        json_data = json.loads(data)
        
        ue_version_var.set(json_data.get("earliestUEVersion", ""))
        
        distribution_method = json_data.get("distributionMethod", "AssetPacks")
        if distribution_method == "ASSET_PACK":
            distribution_method_var.set("AssetPacks")
        elif distribution_method == "CODE_PLUGIN":
            distribution_method_var.set("Plugins")
        elif distribution_method == "COMPLETE_PROJECT":
            distribution_method_var.set("CompleteProjects")
        
        app_name_var.set(json_data.get("appName", ""))
        
        output_label.config(text="Data loaded from clipboard.", fg="green")
    except (json.JSONDecodeError, KeyError):
        output_label.config(text="Wrong format received, you need to click 'P4V data' in the SF Helper", fg="red")
    except Exception as e:
        output_label.config(text=f"Error loading data: {e}", fg="red")

# Function to toggle dark mode
def toggle_dark_mode():
    global dark_mode
    dark_mode = not dark_mode
    apply_theme()
    save_workspace(workspace_var.get())  # Save dark mode state

# Apply the current theme based on dark_mode variable
def apply_theme():
    bg_color = "#2E2E2E" if dark_mode else "#F0F0F0"
    fg_color = "#FFFFFF" if dark_mode else "#000000"
    button_color = "#444444" if dark_mode else "#FFFFFF"
    radiobutton_selectcolor = "#666666" if dark_mode else "#F0F0F0"  # Dark gray for dark mode, light gray for light mode
    
    root.config(bg=bg_color)
    for widget in root.winfo_children():
        widget_type = widget.winfo_class()
        # Skip applying theme to the "Get data" button
        if widget_type == "Button" and widget.cget("text") == "Get Data":
            continue
        widget.config(bg=bg_color)
        
        # Apply foreground color only to text-based widgets
        if widget_type in ("Label", "Button", "Entry", "Radiobutton"):
            widget.config(fg=fg_color)
        
        if widget_type == "Button":
            widget.config(bg=button_color, fg=fg_color)
        
        # Apply selectcolor for Radiobuttons
        if widget_type == "Radiobutton":
            widget.config(selectcolor=radiobutton_selectcolor)

# GUI Setup (add the new button here)
root = tk.Tk()
root.title("P4 Workspace Folder Creator v0.1 Beta")
root.geometry("500x500")
root.resizable(True, True)

# Add padding at the top
tk.Label(root, text="").grid(row=0, column=0, pady=(10, 0))

# Workspace selection
workspace_var = tk.StringVar()
tk.Label(root, text="P4 Workspace:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
tk.Entry(root, textvariable=workspace_var, width=45).grid(row=1, column=1, padx=10, sticky="w")
tk.Button(root, text="Browse", command=browse_workspace).grid(row=1, column=2, padx=10, sticky="e")

# Get Data Button
tk.Button(root, text="Get Data", command=get_data_from_clipboard, bg="#dbca09", fg="black").grid(row=2, column=1, padx=100, pady=5, sticky="w")

# UE Version
ue_version_var = tk.StringVar()
tk.Label(root, text="UE Version (E.G: 4.27):").grid(row=3, column=0, padx=10, pady=5, sticky="w")
tk.Entry(root, textvariable=ue_version_var, width=10).grid(row=3, column=1, padx=10, sticky="w")

# Distribution Method
distribution_method_var = tk.StringVar(value="AssetPacks")  # AssetPacks selected by default
tk.Label(root, text="Distribution Method:").grid(row=4, column=0, padx=10, pady=5, sticky="w")
methods = ["AssetPacks", "CompleteProjects", "Plugins"]
for i, method in enumerate(methods):
    tk.Radiobutton(root, text=method, variable=distribution_method_var, value=method).grid(row=5 + i, column=1, padx=10, sticky="w")

# App Name
app_name_var = tk.StringVar()
tk.Label(root, text="App Name:").grid(row=8, column=0, padx=10, pady=5, sticky="w")
tk.Entry(root, textvariable=app_name_var, width=45).grid(row=8, column=1, columnspan=2, padx=10, sticky="w")

# Buttons
button_frame = tk.Frame(root)
button_frame.grid(row=9, column=0, columnspan=3, pady=20)

tk.Button(button_frame, text="Generate", command=create_folder, bg="green", fg="white").grid(row=0, column=0, padx=10)
tk.Button(button_frame, text="Clear", command=clear_fields, bg="red", fg="white").grid(row=0, column=1, padx=10)
tk.Button(button_frame, text="Clear Workspace", command=clear_workspace, bg="orange", fg="white").grid(row=0, column=2, padx=10)

# Remove Horde Info Button
# tk.Button(button_frame, text="Horde Info", command=get_horde_info, bg="blue", fg="white").grid(row=0, column=3, padx=10)

# Output Label
output_label = tk.Label(root, text="", font=("Arial", 10), fg="green", wraplength=450, justify="center")
output_label.grid(row=10, column=0, columnspan=3, pady=10)

# Author Credits
credits_text = "Minitool created for Modsquad Epic MKTP, DM me on Slack for any bug report / Ideas - Oscar O."
credits_label = tk.Label(root, text=credits_text, font=("Arial", 8), fg="gray", wraplength=350, justify="center")
credits_label.grid(row=11, column=0, columnspan=3, pady=10)

# Dark Mode Toggle Button at the Bottom
toggle_button = tk.Button(root, text="☀ Dark/Light Mode", command=toggle_dark_mode, font=("Arial", 8), bg="lightgray", fg="black")
toggle_button.grid(row=12, column=0, columnspan=3, pady=10)

# Load the saved workspace path when the program starts
load_workspace()

# Bind the save_window_position function to the window close event
root.protocol("WM_DELETE_WINDOW", lambda: [save_window_position(), root.destroy()])

# Run the Tkinter main loop
root.mainloop()
