# System and standard library imports
import win32gui
import win32con
import win32api
import win32com.client
import ctypes
import os, sys, re, shutil, json, math
import time, datetime, subprocess
from itertools import cycle
from ctypes import windll
import urllib.request
import webbrowser

# Tkinter imports
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk, dialog

# Third-party imports
import pyperclip
from P4 import P4, P4Exception
import configparser
import threading

# Define global variables
global workspace_var, ue_version_var, distribution_method_var, app_name_var, sf_case_var, root, output_label

# Initialize these to None
root = None
output_label = None
output_text = None
loading_thread = None
stop_loading = False
selected_path = None
workspace_var = None
ue_version_var = None
distribution_method_var = None
app_name_var = None
sf_case_var = None
dark_mode = False
config_file = "config.txt"



def check_p4_installed():
    """Check if P4 command-line client is installed"""
    try:
        # First try PATH
        result = subprocess.run(['p4', '-V'], 
                              capture_output=True, 
                              text=True,
                              startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        return result.returncode == 0
    except FileNotFoundError:
        try:
            # Try common installation paths
            p4_paths = [
                r"C:\Program Files\Perforce\p4.exe",
                r"C:\Program Files (x86)\Perforce\p4.exe"
            ]
            for path in p4_paths:
                if os.path.exists(path):
                    # Add to PATH
                    os.environ['PATH'] = os.path.dirname(path) + os.pathsep + os.environ['PATH']
                    return True
            return False
        except:
            return False

def download_p4_installer(progress_callback=None):
    """Download P4 installer from Perforce website"""
    url = "https://cdist2.perforce.com/perforce/r24.2/bin.ntx64/helix-p4-x64.exe"
    local_path = os.path.join(os.environ['TEMP'], "helix-p4-x64.exe")
    
    try:
        import urllib.request
        
        def report_progress(count, block_size, total_size):
            if progress_callback:
                percentage = int(count * block_size * 100 / total_size)
                progress_callback(min(percentage, 100))
        
        urllib.request.urlretrieve(url, local_path, reporthook=report_progress)
        return local_path
    except Exception as e:
        raise Exception(f"Failed to download P4 installer: {str(e)}")



def install_p4(installer_path, progress_window):
    """Install P4 using the downloaded installer"""
    try:
        # Update progress window
        progress_window.update_status("Checking installation permissions...")
        progress_window.update_progress(0)

        # Check if we need admin rights
        if not check_admin_rights():
            progress_window.update_status("Administrator rights required for installation...")
            response = messagebox.askyesno(
                "Administrator Rights Required",
                "Installing P4 CLI requires administrator rights. Do you want to restart with admin privileges?",
                icon='warning'
            )
            if response:
                progress_window.close()
                request_admin()
                return False
            else:
                raise Exception("Administrator rights are required to install P4 CLI")
        
        # Update progress window
        progress_window.update_status("Installing P4 CLI...")
        progress_window.update_progress(10)
        
        # Verify installer exists
        if not os.path.exists(installer_path):
            raise Exception("Installer file not found")
        
        progress_window.update_progress(20)
        
        # Run installer silently
        process = subprocess.Popen(
            [installer_path, '/VERYSILENT', '/SUPPRESSMSGBOXES'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW)
        )
        
        # Monitor installation progress
        while process.poll() is None:
            progress_window.update_progress(50)  # Show indeterminate progress
            time.sleep(0.1)
        
        progress_window.update_progress(80)
        
        # Check installation result
        if process.returncode == 0:
            # Verify P4 is now available
            progress_window.update_status("Verifying installation...")
            verification_attempt = 0
            max_attempts = 3
            
            while verification_attempt < max_attempts:
                try:
                    check_result = subprocess.run(
                        ['p4', '-V'],
                        capture_output=True,
                        text=True,
                        startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW)
                    )
                    if check_result.returncode == 0:
                        progress_window.update_progress(100)
                        progress_window.update_status("Installation completed successfully!")
                        
                        # Refresh PATH environment
                        os.environ['PATH'] = os.path.dirname(installer_path) + os.pathsep + os.environ['PATH']
                        
                        return True
                except:
                    verification_attempt += 1
                    time.sleep(1)  # Wait before retry
            
            raise Exception("P4 CLI installation completed but verification failed")
        else:
            stderr = process.stderr.read() if process.stderr else "Unknown error"
            raise Exception(f"Installation failed with return code {process.returncode}: {stderr}")
            
    except Exception as e:
        error_msg = str(e)
        progress_window.update_status(f"Installation failed: {error_msg}")
        raise Exception(f"Failed to install P4: {error_msg}")
    finally:
        # Clean up installer file
        try:
            if os.path.exists(installer_path):
                os.remove(installer_path)
        except:
            pass

def check_admin_rights():
    """Check if program has admin rights for installation"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def request_admin():
    """Request admin rights if needed"""
    try:
        if sys.platform == 'win32':
            if getattr(sys, 'frozen', False):
                # If running as exe
                executable = sys.executable
            else:
                # If running as script
                executable = sys.executable
            
            ctypes.windll.shell32.ShellExecuteW(
                None, 
                "runas",
                executable,
                ' '.join(sys.argv),
                None,
                1
            )
            sys.exit()
    except Exception as e:
        messagebox.showerror(
            "Error",
            f"Failed to request administrator rights: {str(e)}\n"
            "Please try running the program as administrator manually."
        )
        sys.exit(1)
    
def cleanup_temp_files():
    """Clean up any temporary files created during installation"""
    try:
        temp_dir = os.environ['TEMP']
        p4_installer = os.path.join(temp_dir, "helix-p4-x64.exe")
        if os.path.exists(p4_installer):
            try:
                os.remove(p4_installer)
            except:
                pass
    except:
        pass

    
    
#Improving the execution of the .exe file
def run_p4_command(command):
    """Run a P4 command without showing command window."""
    try:
        # Add CREATE_NO_WINDOW flag on Windows
        startupinfo = None
        if sys.platform == "win32":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
            startupinfo=startupinfo  # This hides the window
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        messagebox.showerror("P4 Error", f"Error executing P4 command: {e.stderr}")
        return None 
    
def save_p4_config(port, user):
    """Save P4 configuration to file"""
    config = configparser.ConfigParser()
    config['P4'] = {
        'port': port,
        'user': user
    }
    with open('p4config.ini', 'w') as configfile:
        config.write(configfile)
    
# validation for numeric input
def validate_numeric_input(P):
    if P == "": # Allow empty field
        return True
    return P.isdigit()

# Window with loading bar for get revision
    
class ProgressWindow:
    def __init__(self, parent, title="Operation Progress", determinate=True):
        self.window = tk.Toplevel(parent)
        self.window.title(title)
        
        # Set window size
        window_width = 600
        window_height = 250
        
        # Get the parent window's position and size
        parent_x = parent.winfo_x()
        parent_y = parent.winfo_y()
        parent_width = parent.winfo_width()
        parent_height = parent.winfo_height()
        
        # Calculate position to center the window relative to parent
        x = parent_x + (parent_width - window_width) // 2
        y = parent_y + (parent_height - window_height) // 2
        
        # Set geometry
        self.window.geometry(f"{window_width}x{window_height}+{x}+{y}")
        
        # Make window non-resizable
        self.window.resizable(False, False)
        
        # Remove minimize/maximize buttons and make it modal
        self.window.transient(parent)
        self.window.grab_set()
        
        # Configure grid
        self.window.grid_columnconfigure(0, weight=1)
        
        # Add progress bar
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(self.window, 
                                          variable=self.progress_var,
                                          mode='determinate' if determinate else 'indeterminate',
                                          maximum=100)
        self.progress_bar.grid(row=0, column=0, padx=20, pady=(20,10), sticky='ew')
        
        # Add percentage label with spinner
        self.percentage_var = tk.StringVar(value="0%")
        self.percentage_frame = tk.Frame(self.window, bg="#2E2E2E")
        self.percentage_frame.grid(row=1, column=0, pady=(0,5))
        
        self.percentage_label = tk.Label(self.percentage_frame, 
                                       textvariable=self.percentage_var,
                                       bg="#2E2E2E",
                                       fg="white")
        self.percentage_label.pack(side=tk.LEFT)
        
        self.spinner_label = tk.Label(self.percentage_frame,
                                    text="",
                                    bg="#2E2E2E",
                                    fg="white",
                                    width=3)
        self.spinner_label.pack(side=tk.LEFT)
        
        # Add status label
        self.status_var = tk.StringVar(value="Starting operation...")
        self.status_label = tk.Label(self.window, 
                                   textvariable=self.status_var,
                                   wraplength=550,
                                   justify='left')
        self.status_label.grid(row=2, column=0, padx=20, pady=(0,10), sticky='w')
        
        # Configure style for dark theme
        self.window.configure(bg="#2E2E2E")
        self.status_label.configure(bg="#2E2E2E", fg="white")
        
        # Animation variables
        self.animation_active = True
        self.current_progress = 0
        self.target_progress = 0
        self.animation_speed = 0.5
        self.secondary_progress = 0
        self.animation_id = None
        self.spinner_id = None
        
        # Spinner characters (you can choose either style)
        # Style 1: Dots
        # self.spinner_chars = ["   ", ".  ", ".. ", "..."]
        # Style 2: Spinning circle
        self.spinner_chars = ["◐", "◓", "◑", "◒"]
        self.spinner_index = 0
        
        # Start spinner animation
        self.animate_spinner()
        
        if not determinate:
            self.progress_bar.start(10)
    
    def animate_spinner(self):
        """Animate the spinner next to the percentage"""
        if not self.animation_active:
            return
            
        self.spinner_index = (self.spinner_index + 1) % len(self.spinner_chars)
        self.spinner_label.config(text=self.spinner_chars[self.spinner_index])
        self.spinner_id = self.window.after(250, self.animate_spinner)
    
    def update_progress(self, percentage, status_text=None):
        """Update progress bar and optionally the status text"""
        self.target_progress = percentage
        if not self.animation_id:  # Start animation if not already running
            self.animate_progress()
            
        self.percentage_var.set(f"{percentage:.1f}%")
        if status_text:
            self.status_var.set(status_text)
        self.window.update()
    
    def animate_progress(self):
        """Animate the progress bar with a smooth forward motion"""
        if not self.animation_active:
            return
            
        # Calculate the difference between current and target progress
        diff = self.target_progress - self.current_progress
        
        if abs(diff) > 0.1:  # If there's a significant difference
            # Move current progress smoothly towards target
            self.current_progress += min(diff * self.animation_speed, 1.0)
            
            # Add a subtle forward-moving secondary progress
            self.secondary_progress = (self.secondary_progress + 0.5) % 20
            if diff > 5:  # Only show secondary progress when there's significant work to do
                display_progress = min(100, self.current_progress + (self.secondary_progress * 0.1))
            else:
                display_progress = self.current_progress
                
            self.progress_var.set(display_progress)
        else:
            self.progress_var.set(self.target_progress)
            
        self.window.update()
        self.animation_id = self.window.after(50, self.animate_progress)
    
    def update_status(self, text):
        """Update only the status text"""
        self.status_var.set(text)
        self.window.update()
    
    def close(self):
        """Close the progress window"""
        self.animation_active = False
        if self.animation_id:
            self.window.after_cancel(self.animation_id)
        if self.spinner_id:
            self.window.after_cancel(self.spinner_id)
        if self.progress_bar['mode'] == 'indeterminate':
            self.progress_bar.stop()
        self.window.grab_release()
        self.window.destroy()


def show_p4_installation_dialog():
    """Show dialog for P4 installation options"""
    dialog = tk.Toplevel(root)
    dialog.title("P4 CLI Required")
    dialog.geometry("400x250")
    dialog.transient(root)
    dialog.grab_set()
    
    # Center the window
    dialog.geometry(f"+{root.winfo_x() + 50}+{root.winfo_y() + 50}")
    
    # Message
    message = tk.Label(dialog, 
                      text="Helix Command-Line Client (P4 CLI) is required but not installed.\n\n"
                           "Would you like to install it now?",
                      wraplength=350)
    message.pack(pady=20)
    
    def start_automatic_installation():
        dialog.destroy()
        
        # Create progress window
        progress_window = ProgressWindow(root, "Installing P4 CLI")
        progress_window.update_status("Downloading P4 CLI installer...")
        
        try:
            # Download installer
            installer_path = download_p4_installer(progress_window.update_progress)
            
            # Install P4
            installation_result = install_p4(installer_path, progress_window)
            
            if installation_result is False:
                # False means we need to restart with admin rights
                # The install_p4 function will have already initiated the restart
                # so we just need to close the current instance
                root.quit()
                return
            elif installation_result is True:
                # Installation successful
                messagebox.showinfo("Success", "P4 CLI installed successfully!")
                # Clean up installer
                try:
                    os.remove(installer_path)
                except:
                    pass
                # Start the application
                initialize_with_details()
            else:
                # None or any other value indicates failure
                raise Exception("Installation failed")
                
        except Exception as e:
            messagebox.showerror("Installation Error", str(e))
            # Ask user if they want to try manual installation
            if messagebox.askyesno("Installation Failed", 
                                 "Would you like to try manual installation instead?"):
                open_download_page()
            else:
                root.quit()
        finally:
            progress_window.close()
    
    def open_download_page():
        dialog.destroy()
        webbrowser.open("https://www.perforce.com/downloads/helix-command-line-client-p4")
        messagebox.showinfo("Manual Installation",
                          "Please install P4 CLI and restart the application when installation is complete.")
        root.quit()
    
    # Buttons
    button_frame = tk.Frame(dialog)
    button_frame.pack(pady=20)
    
    tk.Button(button_frame, 
              text="Install Automatically", 
              command=start_automatic_installation).pack(side=tk.LEFT, padx=10)
    
    tk.Button(button_frame, 
              text="Download Manually", 
              command=open_download_page).pack(side=tk.LEFT, padx=10)
    
    tk.Button(button_frame, 
              text="Exit", 
              command=lambda: [dialog.destroy(), root.quit()]).pack(side=tk.LEFT, padx=10)
    
    # Apply theme
    if dark_mode:
        dialog.configure(bg="#2E2E2E")
        message.configure(bg="#2E2E2E", fg="white")
        button_frame.configure(bg="#2E2E2E")
        for widget in button_frame.winfo_children():
            if isinstance(widget, tk.Button):
                widget.configure(bg="#444444", fg="white")


def initialize_with_details():
    """Initialize application with threaded P4 connection check and details"""
    # Show initial loading screen
    loading_frame = tk.Frame(root, bg="#2E2E2E", highlightbackground="white", highlightthickness=2)
    loading_frame.place(relx=0.5, rely=0.5, anchor="center")
    
    loading_text = tk.Label(
        loading_frame,
        text="Initializing P4 connection...",
        font=("Arial", 10),
        bg="#2E2E2E",
        fg="white"
    )
    loading_text.pack(pady=10, padx=20)
    
    spinner_label = tk.Label(
        loading_frame,
        text="⣾",
        font=("Arial", 12),
        bg="#2E2E2E",
        fg="white"
    )
    spinner_label.pack(pady=(0,10))
    
    # Variable to control animation
    animation_running = True
    thread_running = True  # New flag to control thread
    
    def update_spinner(index=0):
        if animation_running and loading_frame.winfo_exists():
            spinner_chars = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]
            spinner_label.config(text=spinner_chars[index])
            next_index = (index + 1) % len(spinner_chars)
            if animation_running:  # Check again before scheduling next update
                root.after(100, update_spinner, next_index)
    
    # Start spinner animation
    update_spinner()
    
    def cleanup():
        nonlocal animation_running
        animation_running = False
        if loading_frame.winfo_exists():
            loading_frame.destroy()
    
    def check_connection():
        nonlocal thread_running
        try:
            if not thread_running:  # Check if we should stop
                cleanup()
                return
                
            # Quick connection test
            test_result = subprocess.run(['p4', 'info'],
                                      capture_output=True,
                                      text=True,
                                      timeout=5,
                                      startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
            
            if not thread_running:  # Check again after long operation
                cleanup()
                return
                
            if test_result.returncode != 0:
                # Connection failed
                root.after(0, lambda: [
                    cleanup(),
                    add_to_log("❌ Unable to connect to P4 server", "red"),
                    add_to_log("⚠️ Hint: Check that your VPN is on", "yellow"),
                    show_p4_error_window(test_result.stderr if test_result.stderr else "Connection failed")
                ])
                return
            
            # If connection test passed, show details
            if thread_running:  # Final check before showing details
                root.after(0, lambda: [
                    cleanup(),
                    display_p4_info()
                ])
            
        except subprocess.TimeoutExpired:
            if thread_running:
                root.after(0, lambda: [
                    cleanup(),
                    add_to_log("❌ Connection attempt timed out", "red"),
                    add_to_log("⚠️ Hint: Check that your VPN is on", "yellow"),
                    show_p4_error_window("Connection attempt timed out")
                ])
        except Exception as e:
            if thread_running:
                root.after(0, lambda: [
                    cleanup(),
                    add_to_log(f"❌ Error checking P4 connection: {str(e)}", "red"),
                    add_to_log("⚠️ Hint: Check that your VPN is on", "yellow"),
                    show_p4_error_window(str(e))
                ])
        finally:
            thread_running = False
    
    # Modify window close handler
    def on_closing():
        nonlocal thread_running
        thread_running = False  # Signal thread to stop
        cleanup()  # Clean up UI
        save_window_position()
        root.destroy()
    
    # Update window close protocol
    root.protocol("WM_DELETE_WINDOW", on_closing)
    
    # Start the connection check in a separate thread
    thread = threading.Thread(target=check_connection)
    thread.daemon = True
    thread.start()




# Function to improve the way the log is displayed when loading things.

def update_last_line(text_widget, new_text, tag=None):
    """Update the last line of the text widget in-place"""
    try:
        last_line_start = text_widget.index("end-2c linestart")
        last_line_end = text_widget.index("end-1c")
        text_widget.delete(last_line_start, last_line_end)
        text_widget.insert(last_line_start, new_text, tag if tag else None)
    except Exception:
        pass  # Fail silently if there's an issue

def loading_animation(action_text="Processing"):
    """Shows a loading animation in the log with custom action text"""
    spinner = cycle(['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'])
    global stop_loading
    
    # Add initial loading message
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    output_text.configure(state='normal')
    output_text.insert(tk.END, f"[{timestamp}] {action_text} ", "color_white")
    output_text.configure(state='disabled')
    
    while not stop_loading:
        output_text.configure(state='normal')
        # Update just the spinner character
        update_last_line(output_text, f"[{timestamp}] {action_text} {next(spinner)}", "color_white")
        output_text.see(tk.END)
        output_text.configure(state='disabled')
        time.sleep(0.1)
    
    # Clear the loading message line when done
    output_text.configure(state='normal')
    last_line_start = output_text.index("end-2c linestart")
    last_line_end = output_text.index("end-1c")
    output_text.delete(last_line_start, last_line_end)
    output_text.configure(state='disabled')

def start_loading_animation(action_text):
    """Start the loading animation in a new thread"""
    global loading_thread, stop_loading
    stop_loading = False
    loading_thread = threading.Thread(target=loading_animation, args=(action_text,))
    loading_thread.daemon = True
    loading_thread.start()

def stop_loading_animation():
    """Stop the loading animation"""
    global stop_loading
    stop_loading = True
    
    
# Functions used for the p4 conection (P4V Conection button)

def init_p4():
    """Initialize P4 connection and return P4 object"""
    p4 = P4()
    
    # Try to get saved credentials from config
    config = configparser.ConfigParser()
    if os.path.exists('p4config.ini'):
        config.read('p4config.ini')
        if 'P4' in config:
            p4.port = config['P4'].get('port', '')
            p4.user = config['P4'].get('user', '')
    
    return p4


def get_p4_info():
    """Get P4 connection info and workspace path"""
    try:
        # Create new P4 instance
        p4 = P4()
        
        # Try to get saved credentials from config
        config = configparser.ConfigParser()
        if os.path.exists('p4config.ini'):
            config.read('p4config.ini')
            if 'P4' in config:
                p4.port = config['P4'].get('port', '')
                p4.user = config['P4'].get('user', '')
        
        # Check login status first
        login_test = subprocess.run(['p4', 'login', '-s'],
                                  capture_output=True,
                                  text=True,
                                  startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        if "invalid or unset" in login_test.stderr or "ticket expired" in login_test.stderr:
            # First check if it's a connection issue
            connection_test = subprocess.run(['p4', 'info'],
                                          capture_output=True,
                                          text=True,
                                          startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
            
            if connection_test.returncode != 0:
                # Connection error - likely VPN issue
                add_to_log("❌ Unable to connect to P4 server", "red")
                add_to_log("⚠️ Hint: Check that your VPN is on", "yellow")
                show_p4_error_window(connection_test.stderr if connection_test.stderr else "Connection failed")
                return False
            
            add_to_log("Not connected to P4. Please provide connection details.", "white")
            
            # Calculate position for dialogs relative to main window
            x = root.winfo_x() + (root.winfo_width() // 2) - 150
            y = root.winfo_y() + (root.winfo_height() // 2) - 50
            
            # Get P4PORT
            p4_port = simpledialog.askstring("P4 Connection", 
                                           "Enter P4PORT (e.g., perforce:1666):",
                                           initialvalue=p4.port if p4.port else "",
                                           parent=root)
            if not p4_port:
                add_to_log("P4PORT is required", "red")
                return False
                
            # Get P4USER
            p4_user = simpledialog.askstring("P4 Connection", 
                                           "Enter P4USER:",
                                           initialvalue=p4.user if p4.user else "",
                                           parent=root)
            if not p4_user:
                add_to_log("P4USER is required", "red")
                return False
                
            # Get P4PASSWD
            p4_passwd = simpledialog.askstring("P4 Connection", 
                                             "Enter P4PASSWD:",
                                             show='*',
                                             parent=root)
            if not p4_passwd:
                add_to_log("P4PASSWD is required", "red")
                return False
            
            # Set environment variables for P4
            os.environ['P4PORT'] = p4_port
            os.environ['P4USER'] = p4_user
            
            try:
                # Use p4 login -a command
                login_process = subprocess.Popen(['p4', 'login', '-a'],
                                              stdin=subprocess.PIPE,
                                              stdout=subprocess.PIPE,
                                              stderr=subprocess.PIPE,
                                              text=True,
                                              startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
                
                # Send password to stdin
                stdout, stderr = login_process.communicate(input=p4_passwd + '\n')
                
                if login_process.returncode != 0:
                    add_to_log(f"Login failed: {stderr}", "red")
                    return False
                
                # If login successful, save config and get workspace info
                save_p4_config(p4_port, p4_user)
                
                # Get workspace info using p4 info command
                info_result = subprocess.run(['p4', 'info'],
                                          capture_output=True,
                                          text=True,
                                          startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
                
                if info_result.returncode == 0:
                    # Parse info output
                    info_lines = info_result.stdout.splitlines()
                    client_name = None
                    for line in info_lines:
                        if line.startswith('Client name:'):
                            client_name = line.split(':', 1)[1].strip()
                            break
                    
                    if client_name:
                        # Get client workspace info
                        client_result = subprocess.run(['p4', 'client', '-o', client_name],
                                                    capture_output=True,
                                                    text=True,
                                                    startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
                        
                        if client_result.returncode == 0:
                            # Parse client output for Root
                            client_lines = client_result.stdout.splitlines()
                            for line in client_lines:
                                if line.startswith('Root:'):
                                    workspace_path = line.split(':', 1)[1].strip()
                                    workspace_var.set(workspace_path)
                                    add_to_log(f"Workspace path set to: {workspace_path}", "green")
                                    save_workspace(workspace_path)
                                    break
                
                add_to_log("Successfully connected to P4", "green")
                return True
                
            except Exception as e:
                add_to_log(f"Error during login: {str(e)}", "red")
                return False
                
        else:
            # Already logged in, just display info
            try:
                info_result = subprocess.run(['p4', 'info'],
                                          capture_output=True,
                                          text=True,
                                          startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
                
                if info_result.returncode == 0:
                    add_to_log("Successfully connected to P4", "green")
                    
                    # Parse info output
                    info_lines = info_result.stdout.splitlines()
                    for line in info_lines:
                        if line.startswith('Client root:'):
                            workspace_path = line.split(':', 1)[1].strip()
                            workspace_var.set(workspace_path)
                            add_to_log(f"Workspace path set to: {workspace_path}", "green")
                            save_workspace(workspace_path)
                            break
                    
                    return True
                
            except Exception as e:
                add_to_log(f"Error accessing P4: {str(e)}", "red")
                add_to_log("⚠️ Hint: Check that your VPN is on", "yellow")
                show_p4_error_window(str(e))
                return False
                
    except subprocess.CalledProcessError as e:
        add_to_log("❌ Unable to connect to P4 server", "red")
        add_to_log("⚠️ Hint: Check that your VPN is on", "yellow")
        show_p4_error_window(e.stderr if e.stderr else "Connection failed")
        return False
    except Exception as e:
        add_to_log(f"❌ Error: {str(e)}", "red")
        add_to_log("⚠️ Hint: Check that your VPN is on", "yellow")
        show_p4_error_window(str(e))
        return False

def p4_connection_button_click():
    """Wrapper to call get_p4_info with loading indicator and threading"""
    # Disable the P4 Connection button
    for widget in p4_actions_frame.winfo_children():
        if widget.cget('text') == "P4 Connection":
            widget.config(state='disabled')

    # Create loading indicator
    loading_frame = tk.Frame(root, bg="#2E2E2E")
    loading_frame.place(relx=0.5, rely=0.5, anchor="center")
    
    loading_text = tk.Label(
        loading_frame,
        text="Verifying P4 connection...",
        font=("Arial", 10),
        bg="#2E2E2E",
        fg="white"
    )
    loading_text.pack(pady=10)
    
    spinner_label = tk.Label(
        loading_frame,
        text="⣾",
        font=("Arial", 12),
        bg="#2E2E2E",
        fg="white"
    )
    spinner_label.pack()
    
    # Variable to control animation
    animation_running = True
    
    def cleanup():
        """Clean up loading indicator and re-enable button"""
        nonlocal animation_running
        animation_running = False
        if loading_frame.winfo_exists():
            loading_frame.destroy()
        
        # Re-enable the P4 Connection button
        for widget in p4_actions_frame.winfo_children():
            if widget.cget('text') == "P4 Connection":
                widget.config(state='normal')
    
    # Spinner animation function
    def update_spinner(index=0):
        if animation_running and loading_frame.winfo_exists():
            spinner_chars = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]
            spinner_label.config(text=spinner_chars[index])
            next_index = (index + 1) % len(spinner_chars)
            root.after(100, update_spinner, next_index)
    
    # Start spinner animation
    update_spinner()
    
    def handle_connection_error(error_msg):
        """Handle connection error on main thread"""
        cleanup()
        add_to_log("❌ Unable to connect to P4 server", "red")
        add_to_log("⚠️ Hint: Check that your VPN is on", "yellow")
        show_p4_error_window(error_msg)
    
    def handle_success():
        """Handle successful connection on main thread"""
        cleanup()
        # Call display_p4_info instead of get_p4_info to show full details
        display_p4_info()
    
    def run_p4_check():
        try:
            # Quick connection test first
            test_result = subprocess.run(['p4', 'info'],
                                      capture_output=True,
                                      text=True,
                                      timeout=5,
                                      startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
            
            if test_result.returncode != 0:
                # Connection failed - schedule error display on main thread
                error_msg = test_result.stderr if test_result.stderr else "Connection failed"
                root.after(0, lambda: handle_connection_error(error_msg))
                return
            
            # If connection test passed, proceed with full connection details
            root.after(0, handle_success)
            
        except subprocess.TimeoutExpired:
            root.after(0, lambda: handle_connection_error("Connection attempt timed out"))
        except Exception as e:
            root.after(0, lambda: handle_connection_error(str(e)))
    
    # Start the check in a separate thread
    thread = threading.Thread(target=run_p4_check)
    thread.daemon = True
    thread.start()
    
# Function to display conection details at startup
def check_p4_connection():
    """Quick check for P4 connectivity"""
    try:
        result = subprocess.run(['p4', 'info'],
                            capture_output=True,
                            text=True,
                            check=True,
                            timeout=5,  # Add timeout to prevent long waits
                            startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        return result.returncode == 0
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        return False

def show_p4_error_window(error_message=None):
    """Show error window for P4 connection issues"""
    try:
        error_window = tk.Toplevel(root)
        error_window.title("P4 Connection Error")
        error_window.geometry("400x200")
        error_window.transient(root)
        
        # Don't grab focus to allow main window to close
        # error_window.grab_set()  # Removed this line
        
        # Center the window relative to main window
        error_window.geometry(f"+{root.winfo_x() + 100}+{root.winfo_y() + 100}")
        
        # Create frame for message
        message_frame = ttk.Frame(error_window)
        message_frame.pack(expand=True, fill='both', padx=20, pady=20)
        
        # Error message
        msg_text = "Unable to connect to P4 server.\n\n"
        if error_message:
            msg_text += f"Error: {error_message}\n\n"
        msg_text += "Hint: Check that your VPN is on."
        
        error_msg = ttk.Label(message_frame, 
                             text=msg_text,
                             wraplength=350,
                             justify='center')
        error_msg.pack(pady=10)
        
        # OK button
        ok_button = ttk.Button(message_frame, 
                              text="OK", 
                              command=error_window.destroy,
                              width=10)
        ok_button.pack(pady=10)
        
        # Apply theme
        if dark_mode:
            error_window.configure(bg="#2E2E2E")
            message_frame.configure(style='Dark.TFrame')
            error_msg.configure(style='Dark.TLabel')
            
        # Make error window close when main window closes
        def on_root_close():
            if error_window.winfo_exists():
                error_window.destroy()
            root.destroy()
            
        root.protocol("WM_DELETE_WINDOW", on_root_close)
            
    except Exception as e:
        print(f"Error showing error window: {e}")

def display_p4_info():
    """Display current P4 connection details in the action log"""
    # Quick connection check first
    if not check_p4_connection():
        add_to_log("❌ Unable to connect to P4 server", "red")
        add_to_log("⚠️ Hint: Check that your VPN is on", "yellow")
        show_p4_error_window()
        return
        
    try:
        # First ensure we're connected using the existing logic
        if get_p4_info():
            # Create startupinfo to hide windows
            startupinfo = None
            if sys.platform == "win32":
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_HIDE

            # Get and display P4 info
            result = subprocess.run(['p4', 'info'],
                                  capture_output=True,
                                  text=True,
                                  check=True,
                                  startupinfo=startupinfo)
            
            if result.returncode == 0:
                info_dict = {}
                for line in result.stdout.splitlines():
                    if line.strip():
                        key, value = line.split(':', 1)
                        info_dict[key.strip()] = value.strip()
                
                add_to_log("════════════════════════", "white")
                add_to_log("P4 Connection Details:", "white")
                add_to_log(f"Server: {info_dict.get('Server address', 'Not found')}", "green")
                add_to_log(f"User: {info_dict.get('User name', 'Not found')}", "green")
                add_to_log(f"Client: {info_dict.get('Client name', 'Not found')}", "green")
                add_to_log(f"Workspace root: {info_dict.get('Client root', 'Not found')}", "green")
                
                # Get and display workspace mappings
                try:
                    client_result = subprocess.run(['p4', 'client', '-o'],
                                                capture_output=True,
                                                text=True,
                                                check=True,
                                                startupinfo=startupinfo)
                    
                    if client_result.returncode == 0:
                        add_to_log("Workspace Mappings:", "white")
                        in_view_section = False
                        for line in client_result.stdout.splitlines():
                            if line.startswith('View:'):
                                in_view_section = True
                                continue
                            if in_view_section and line.strip() and not line.startswith('\t'):
                                break
                            if in_view_section and line.strip():
                                add_to_log(f"└─ {line.strip()}", "green")
                except Exception:
                    # Skip workspace mappings if there's an error
                    pass
                    
                add_to_log("════════════════════════", "white")
                
    except Exception as e:
        error_msg = str(e)
        add_to_log(f"❌ Error displaying P4 info: {error_msg}", "red")
        show_p4_error_window(error_msg)

def p4_add(path):
    """Add a file or directory to P4."""
    return run_p4_command(['p4', 'add', f'{path}...'])

def p4_edit(path):
    """Open a file or directory for edit in P4."""
    return run_p4_command(['p4', 'edit', f'{path}...'])

def p4_revert(path):
    """Revert a file or directory in P4."""
    return run_p4_command(['p4', 'revert', f'{path}...'])

def p4_sync(path):
    """Sync a file or directory in P4."""
    return run_p4_command(['p4', 'sync', f'{path}...'])


def add_to_log(message, color="black"):
    """Add message to log with timestamp and color"""
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    output_text.configure(state='normal')
    output_text.insert(tk.END, f"[{timestamp}] {message}\n", f"color_{color}")
    output_text.see(tk.END)  # Auto-scroll to the end
    output_text.configure(state='disabled')
    


def get_depot_info(depot_path):
    """Get information about files to be synced using p4 files"""
    try:
        command = ['p4', 'files', f'{depot_path}...']
        
        # Create startupinfo to hide windows
        startupinfo = None
        if sys.platform == "win32":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE
        
        result = subprocess.run(command, 
                              capture_output=True, 
                              text=True, 
                              check=True,
                              startupinfo=startupinfo)
        
        # Count the number of files by counting non-empty lines
        files = [line for line in result.stdout.split('\n') if line.strip()]
        total_files = len(files)
        
        if total_files > 0:
            add_to_log(f"Found {total_files} files to sync", "white")
            return total_files, None  # We don't need size for now
        else:
            add_to_log("No files found in depot path", "red")
            return None, None
            
    except subprocess.CalledProcessError as e:
        if "no such file" in str(e.stderr).lower():
            add_to_log("❌ Path not found in depot", "red")
        else:
            add_to_log(f"❌ Error getting depot info: {str(e.stderr)}", "red")
        return None, None
    except Exception as e:
        add_to_log(f"❌ Error: {str(e)}", "red")
        return None, None

# Get revision code

def perform_p4_sync(depot_path):
    """Perform simple p4 sync with progress tracking and UI features"""
    progress_window = None
    try:
        # Disable the Get Revision button during sync
        for widget in p4_actions_frame.winfo_children():
            if widget.cget('text') == "Get Revision":
                widget.config(state='disabled')

        # Create progress window (start with indeterminate for file counting)
        progress_window = ProgressWindow(root, "Sync Progress", determinate=False)
        progress_window.update_status("Counting files...")
        progress_window.progress_bar.start(10)  # Start the indeterminate animation

        # Get file count for progress tracking
        total_files, _ = get_depot_info(depot_path)

        # If no files are found, stop and close the progress window
        if total_files is None:
            progress_window.update_status("No files found in depot path.")
            time.sleep(1)  # Allow time for the user to see the message
            if progress_window and progress_window.window.winfo_exists():
                progress_window.close()
            return

        # Close the indeterminate progress window and create a determinate one
        if progress_window and progress_window.window.winfo_exists():
            progress_window.close()

        # Create new determinate progress window
        progress_window = ProgressWindow(root, "Sync Progress", determinate=True)
        add_to_log(f"Starting sync of {total_files} files", "white")
        progress_window.update_progress(0, f"Preparing to sync {total_files} files...")

        # Sync command with #head
        command = ['p4', 'sync', '-f', f'{depot_path}...#head']
        add_to_log(f"Executing command: {' '.join(command)}", "white")

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW)
        )

        files_processed = 0
        all_output = []

        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                all_output.append(line.strip())
                files_processed += 1
                percentage = min((files_processed / max(total_files, 1)) * 100, 100)
                progress_window.update_progress(percentage, f"Syncing: {line.strip()}")

        # Process remaining errors
        error_output = process.stderr.read().strip()
        if error_output:
            add_to_log(f"⚠️ Sync encountered errors:\n{error_output}", "red")

        # Ensure we show 100% at completion
        if process.returncode == 0:
            progress_window.update_progress(100, "Sync completed")
            local_path = os.path.join(workspace_var.get(), depot_path.split('//depot/')[-1])
            actual_files = sum([len(files) for _, _, files in os.walk(local_path)])
            add_to_log(f"✅ Sync completed - {actual_files} files in workspace", "green")
            
            try:
                if os.path.exists(local_path):
                    os.startfile(local_path)
                    add_to_log(f"📂 Opening folder: {local_path}", "green")
                else:
                    add_to_log(f"⚠️ Folder not found: {local_path}", "red")
            except Exception as e:
                add_to_log(f"❌ Error opening folder: {str(e)}", "red")
        else:
            progress_window.update_progress(100, "Sync failed")
            add_to_log("❌ Sync failed with errors", "red")

    except Exception as e:
        add_to_log(f"❌ Error executing P4 sync: {str(e)}", "red")
    finally:
        # Ensure progress window is closed
        if progress_window and progress_window.window.winfo_exists():
            progress_window.close()

        # Re-enable the Get Revision button
        for widget in p4_actions_frame.winfo_children():
            if widget.cget('text') == "Get Revision":
                widget.config(state='normal')

        add_to_log("════════════════════════", "white")



def get_revision():
    """Get latest revision for specific content"""
    # Get and validate all required fields
    workspace = workspace_var.get().strip()
    ue_version = ue_version_var.get().strip()
    distribution_method = distribution_method_var.get().strip()
    app_name = app_name_var.get().strip()

    # Validate all fields are filled
    if not all([workspace, ue_version, distribution_method, app_name]):
        add_to_log("Error: All fields must be filled (Workspace, UE Version, Distribution Method, App Name).", "red")
        return

    # Validate UE version format
    if not re.match(r'^\d+\.\d+$', ue_version):
        add_to_log("Error: UE Version must be in the format 'X.Y' (e.g., 4.27 or 5.3).", "red")
        return

    # Determine UE content type based on version
    ue_content = "UE5-UserContent" if float(ue_version) >= 5.0 else "UE4-UserContent"
    
    # Construct depot path
    depot_path = f"//depot/{ue_content}/{ue_version}/{distribution_method}/{app_name}"
    
    add_to_log("Starting sync operation...", "white")
    add_to_log(f"Syncing from depot path: {depot_path}", "white")
    
    # Create and start a thread for the sync operation
    sync_thread = threading.Thread(target=perform_p4_sync, args=(depot_path,))
    sync_thread.daemon = True  # Thread will close when main program closes
    sync_thread.start()
    
    
#Function to reconcile and submit files in P4

def perform_reconcile_submit(local_path):
    """Perform reconcile and submit operation with progress tracking"""
    progress_window = None
    try:
        # Disable the Reconcile & Submit button during operation
        for widget in p4_actions_frame.winfo_children():
            if widget.cget('text') == "Reconcile & Submit":
                widget.config(state='disabled')
        
        # Check for files to reconcile
        command = ['p4', 'reconcile', '-f', '-m', f'{local_path}...']
        add_to_log(f"Checking for files to reconcile in: {local_path}", "white")
        
        result = subprocess.run(command, 
                              capture_output=True, 
                              text=True, 
                              check=False,
                              startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        # If no files to reconcile
        if not result.stdout.strip():
            add_to_log(f"⚠️ No files to reconcile in {local_path}", "yellow")
            
            # Create custom messagebox
            no_files_window = tk.Toplevel(root)
            no_files_window.title("No Files to Reconcile")
            no_files_window.geometry("400x150")
            no_files_window.transient(root)
            no_files_window.grab_set()
            
            # Center the window relative to main window
            no_files_window.geometry(f"+{root.winfo_x() + 100}+{root.winfo_y() + 100}")
            
            # Add message
            message_label = tk.Label(no_files_window, 
                                   text=f"No files to reconcile in:\n{local_path}", 
                                   wraplength=350,
                                   justify='center')
            message_label.pack(pady=20)
            
            # Add OK button
            ok_button = tk.Button(no_files_window, 
                                text="OK", 
                                command=no_files_window.destroy,
                                width=10)
            ok_button.pack(pady=10)
            
            # Apply theme to match main window
            if dark_mode:
                no_files_window.configure(bg="#2E2E2E")
                message_label.configure(bg="#2E2E2E", fg="white")
                ok_button.configure(bg="#444444", fg="white")
            
            return
            
        # Parse reconcile output to categorize changes
        changes = {
            'add': [],
            'edit': [],
            'delete': []
        }
        
        for line in result.stdout.splitlines():
            line_lower = line.lower()
            if 'add' in line_lower:
                changes['add'].append(line.strip())
            elif 'edit' in line_lower:
                changes['edit'].append(line.strip())
            elif 'delete' in line_lower:
                changes['delete'].append(line.strip())
        
        # If files found, show reconcile reason dialog with file preview
        reason_window = tk.Toplevel(root)
        reason_window.title("Reconcile Preview & Reason")
        reason_window.geometry("600x500")
        reason_window.transient(root)
        reason_window.grab_set()
        
        # Create frame for file preview
        preview_frame = ttk.LabelFrame(reason_window, text="Files to be Reconciled")
        preview_frame.pack(pady=10, padx=10, fill=tk.BOTH, expand=True)
        
        # Create text widget with scrollbar for file preview
        preview_text = tk.Text(preview_frame, height=15, width=70, wrap=tk.NONE)
        scrollbar_y = ttk.Scrollbar(preview_frame, orient=tk.VERTICAL, command=preview_text.yview)
        scrollbar_x = ttk.Scrollbar(preview_frame, orient=tk.HORIZONTAL, command=preview_text.xview)
        preview_text.configure(yscrollcommand=scrollbar_y.set, xscrollcommand=scrollbar_x.set)
        
        # Pack scrollbars and text widget
        scrollbar_y.pack(side=tk.RIGHT, fill=tk.Y)
        scrollbar_x.pack(side=tk.BOTTOM, fill=tk.X)
        preview_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Insert categorized changes into preview
        for change_type, files in changes.items():
            if files:
                preview_text.insert(tk.END, f"\n{change_type.upper()} ({len(files)} files):\n")
                for file in files:
                    preview_text.insert(tk.END, f"{file}\n")
        
        preview_text.configure(state='disabled')  # Make text read-only
        
        # Create frame for reason selection
        reason_frame = ttk.LabelFrame(reason_window, text="Select Reconcile Reason")
        reason_frame.pack(pady=10, padx=10, fill=tk.X)
        
        selected_reason = tk.StringVar(value="New Submission")
        
        def set_reason_and_close():
            reason_window.result = selected_reason.get()
            reason_window.destroy()
        
        # Center the window
        reason_window.geometry(f"+{root.winfo_x() + 50}+{root.winfo_y() + 50}")
        
        # Add radio buttons to reason frame
        for reason in ["New Submission", "Update", "Add"]:
            tk.Radiobutton(reason_frame, text=reason, variable=selected_reason, 
                          value=reason).pack(pady=5)
        
        # Add OK button at the bottom
        tk.Button(reason_window, text="OK", command=set_reason_and_close, width=10).pack(pady=10)
        
        # Apply theme
        if dark_mode:
            reason_window.configure(bg="#2E2E2E")
            preview_text.configure(bg="#1E1E1E", fg="white")
            reason_frame.configure(style='Dark.TLabelframe')
            preview_frame.configure(style='Dark.TLabelframe')
            
            for widget in reason_frame.winfo_children():
                if isinstance(widget, tk.Radiobutton):
                    widget.configure(bg="#2E2E2E", fg="white", selectcolor="#3E3E3E",
                                   activebackground="#2E2E2E", activeforeground="white")
            
            for widget in reason_window.winfo_children():
                if isinstance(widget, tk.Button):
                    widget.configure(bg="#444444", fg="white")
        
        # Wait for user input
        reason_window.wait_window()
        if not hasattr(reason_window, 'result'):
            add_to_log("❌ Reconcile cancelled by user", "red")
            return
            
        reconcile_reason = reason_window.result
        sf_case = sf_case_var.get().strip()
        
        # Create changelist description
        description = f"{reconcile_reason} {sf_case} Reconciled offline work"
        
        # Create new changelist
        create_cl_cmd = ['p4', 'change', '-o']
        cl_process = subprocess.run(create_cl_cmd,
                                  capture_output=True,
                                  text=True,
                                  check=True,
                                  startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        cl_spec = cl_process.stdout
        
        # Find and replace the Description section
        spec_lines = cl_spec.splitlines()
        new_spec_lines = []
        in_description = False
        description_added = False
        
        for line in spec_lines:
            if line.startswith('Description:'):
                in_description = True
                new_spec_lines.append(line)
                new_spec_lines.append(f'\t{description}')
                description_added = True
            elif in_description and (line.strip() == "<enter description here>" or line.startswith('\t')):
                continue
            elif line.startswith('Files:') or line.startswith('Status:'):
                in_description = False
                new_spec_lines.append(line)
            else:
                new_spec_lines.append(line)
                
        modified_spec = '\n'.join(new_spec_lines)
        
        # Create the changelist with the new specification
        create_cl_process = subprocess.run(['p4', 'change', '-i'],
                                         input=modified_spec,
                                         capture_output=True,
                                         text=True,
                                         startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        if create_cl_process.returncode != 0:
            add_to_log(f"❌ Error creating changelist: {create_cl_process.stderr}", "red")
            return
            
        try:
            changelist_number = create_cl_process.stdout.split()[1]
            add_to_log(f"✓ Created changelist {changelist_number}", "green")
        except (IndexError, AttributeError):
            add_to_log("❌ Error: Could not create new changelist", "red")
            add_to_log(f"Output was: {create_cl_process.stdout}", "red")
            return

        # Get total number of files to be processed
        total_files = len(changes['add']) + len(changes['edit']) + len(changes['delete'])
        
        # Create progress window for submit
        progress_window = ProgressWindow(root, "Submit Progress", determinate=True)
        progress_window.update_progress(0, f"Preparing to submit {total_files} files...")
        
        # Submit changelist
        submit_cmd = ['p4', 'submit', '-c', changelist_number]
        process = subprocess.Popen(submit_cmd,
                                 stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE,
                                 text=True,
                                 bufsize=1,
                                 universal_newlines=True,
                                 startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        # Initialize counters
        processed_files = []
        start_time = time.time()
        
        # Process output in real-time
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                processed_files.append(line.strip())
                # Calculate progress
                progress = (len(processed_files) / total_files * 100)
                
                # Format time elapsed
                elapsed_time = time.time() - start_time
                elapsed_minutes = int(elapsed_time // 60)
                elapsed_seconds = int(elapsed_time % 60)
                
                # Update progress window
                status_text = (
                    f"Processing file {len(processed_files)} of {total_files}\n"
                    f"Current file: {line.strip()}\n"
                    f"Time elapsed: {elapsed_minutes}m {elapsed_seconds}s"
                )
                progress_window.update_progress(progress, status_text)
        
        # Process remaining errors
        error_output = process.stderr.read().strip()
        if error_output:
            add_to_log(f"⚠️ Submit encountered errors:\n{error_output}", "red")
            return
            
        if process.returncode == 0:
            progress_window.update_progress(100, "Submit completed successfully")
            add_to_log(f"✅ Successfully submitted changelist {changelist_number}", "green")
            add_to_log(f"Total files processed: {len(processed_files)}", "white")
            elapsed_time = time.time() - start_time
            add_to_log(f"Total time: {elapsed_time / 60:.1f} minutes", "white")
            
            # Log summary of changes
            summary_parts = []
            if changes['add']:
                summary_parts.append(f"{len(changes['add'])} added")
            if changes['edit']:
                summary_parts.append(f"{len(changes['edit'])} edited")
            if changes['delete']:
                summary_parts.append(f"{len(changes['delete'])} deleted")
                
            if summary_parts:
                summary = f"Summary: {', '.join(summary_parts)}"
                add_to_log(summary, "white")
        else:
            add_to_log("❌ Submit failed", "red")
            
    except Exception as e:
        add_to_log(f"❌ Error: {str(e)}", "red")
    finally:
        if progress_window and progress_window.window.winfo_exists():
            progress_window.close()
            
        # Re-enable the button
        for widget in p4_actions_frame.winfo_children():
            if widget.cget('text') == "Reconcile & Submit":
                widget.config(state='normal')
        add_to_log("════════════════════════", "white")




def reconcile_submit():
    """Main function to handle reconcile and submit operation"""
    # Get and validate inputs
    workspace = workspace_var.get().strip()
    ue_version = ue_version_var.get().strip()
    distribution_method = distribution_method_var.get()
    app_name = app_name_var.get().strip()
    sf_case = sf_case_var.get().strip()
    
    # Validate inputs
    if not all([workspace, ue_version, distribution_method, app_name]):
        add_to_log("❌ Error: All fields must be filled (Workspace, UE Version, Distribution Method, App Name).", "red")
        return
        
    if not re.match(r'^\d+\.\d+$', ue_version):
        add_to_log("❌ Error: UE Version must be in the format 'X.Y' (e.g., 4.27 or 5.3).", "red")
        return
        
    if not sf_case:
        add_to_log("❌ Error: SF Case number is required for reconcile and submit.", "red")
        return
    
    # Determine UE content type based on version
    ue_content = "UE5-UserContent" if float(ue_version) >= 5.0 else "UE4-UserContent"
    
    # Construct local path
    local_path = os.path.join(workspace, ue_content, ue_version, distribution_method, app_name)
    
    if not os.path.exists(local_path):
        add_to_log(f"❌ Error: Local path does not exist: {local_path}", "red")
        return
    
    # Start reconcile and submit operation in a new thread
    thread = threading.Thread(target=perform_reconcile_submit, args=(local_path,))
    thread.daemon = True
    thread.start() 
    
    
# Function to find app name locations in depot

def perform_depot_search():
    """Execute the actual depot search in a separate thread"""
    try:
        app_name = app_name_var.get().strip()
        
        # Disable the Find in Depot button during search
        for widget in p4_actions_frame.winfo_children():
            if widget.cget('text') == "Find in Depot":
                widget.config(state='disabled')
        
        command = ['p4', 'dirs', '-C', f'//depot/*/*/*/*{app_name}']
        add_to_log(f"Executing command: {' '.join(command)}", "white")
        
        # Start loading animation after showing command
        start_loading_animation("Searching in depot")
        
        result = subprocess.run(command, 
                              capture_output=True, 
                              text=True, 
                              check=False,
                              encoding='utf-8',
                              startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        # Stop loading animation before showing results
        stop_loading_animation()
        time.sleep(0.2)  # Small delay to ensure animation thread completes
        
        # Process results
        if result.stdout:
            locations = [loc for loc in result.stdout.strip().split('\n') if loc]
            add_to_log(f"✅ Found {len(locations)} location(s):", "green")
            for loc in locations:
                add_to_log(f"📁 {loc}", "white")
        else:
            add_to_log("❌ No matching folders found in depot", "red")
            
        if result.stderr:
            add_to_log(f"⚠️ Error occurred during search:", "red")
            add_to_log(result.stderr.strip(), "red")
                
    except Exception as e:
        stop_loading_animation()
        add_to_log(f"❌ Error searching depot: {str(e)}", "red")
    finally:
        # Re-enable the Find in Depot button
        for widget in p4_actions_frame.winfo_children():
            if widget.cget('text') == "Find in Depot":
                widget.config(state='normal')
        add_to_log("════════════════════════", "white")

def find_in_depot():
    """Search for app name in P4 depot at 4 directory levels"""
    app_name = app_name_var.get().strip()
    
    if not app_name:
        add_to_log("❌ Error: Please enter an App Name to search", "red")
        return
        
    add_to_log(f"🔍 Searching for '{app_name}' in depot...", "white")
    
    # Create and start a thread for the search operation
    search_thread = threading.Thread(target=perform_depot_search)
    search_thread.daemon = True  # Thread will close when main program closes
    search_thread.start()


#Function to Rename & Move


def perform_rename_move(source_path, new_name, new_location, progress_window):
    """Perform the P4 rename/move operation with progress tracking"""
    try:
        # Construct the new path
        new_path = os.path.join(new_location, new_name)
        if new_path == source_path:
            add_to_log("❌ Error: New path is same as current path", "red")
            return

        # Create changelist description
        sf_case = sf_case_var.get().strip()
        description = f"{sf_case} Rename/move file(s)"

        # 1. Create new changelist (20% progress)
        progress_window.update_progress(0, "Creating changelist...")
        create_cl_cmd = ['p4', 'change', '-o']
        cl_process = subprocess.run(create_cl_cmd,
                                  capture_output=True,
                                  text=True,
                                  check=True,
                                  startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))

        # Modify changelist spec
        cl_spec = cl_process.stdout
        spec_lines = cl_spec.splitlines()
        new_spec_lines = []
        in_description = False

        for line in spec_lines:
            if line.startswith('Description:'):
                in_description = True
                new_spec_lines.append(line)
                new_spec_lines.append(f'\t{description}')
            elif in_description and (line.strip() == "<enter description here>" or line.startswith('\t')):
                continue
            else:
                new_spec_lines.append(line)
                
        modified_spec = '\n'.join(new_spec_lines)

        # Create the changelist
        create_cl_process = subprocess.run(['p4', 'change', '-i'],
                                         input=modified_spec,
                                         capture_output=True,
                                         text=True,
                                         startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))

        if create_cl_process.returncode != 0:
            add_to_log(f"❌ Error creating changelist: {create_cl_process.stderr}", "red")
            return

        # Get changelist number
        changelist_number = create_cl_process.stdout.split()[1]
        add_to_log(f"✓ Created changelist {changelist_number}", "green")
        progress_window.update_progress(20, "Changelist created successfully")

        # 2. Open files for edit (40% progress)
        progress_window.update_progress(20, "Opening files for edit...")
        edit_cmd = ['p4', 'edit', f"{source_path}/..."]
        edit_result = subprocess.run(edit_cmd, 
                                   capture_output=True, 
                                   text=True,
                                   startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        if edit_result.returncode != 0:
            add_to_log(f"❌ Error opening files for edit: {edit_result.stderr}", "red")
            return

        progress_window.update_progress(40, "Files opened for edit")

        # 3. Perform move operation (70% progress)
        progress_window.update_progress(40, "Performing move operation...")
        move_cmd = ['p4', 'move', '-c', changelist_number, 
                   f"{source_path}/...", f"{new_path}/..."]
        
        move_result = subprocess.run(move_cmd, 
                                   capture_output=True, 
                                   text=True,
                                   startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
        
        if move_result.returncode != 0:
            add_to_log(f"❌ Error during move: {move_result.stderr}", "red")
            return

        progress_window.update_progress(70, "Move operation completed")

        # 4. Submit the changelist (100% progress)
        progress_window.update_progress(70, "Submitting changes...")
        submit_cmd = ['p4', 'submit', '-c', changelist_number]
        submit_result = subprocess.run(submit_cmd, 
                                     capture_output=True, 
                                     text=True,
                                     startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))

        if submit_result.returncode == 0:
            # Count moved files
            moved_files = [line for line in move_result.stdout.splitlines() if line.strip()]
            file_count = len(moved_files)
            
            progress_window.update_progress(100, "Operation completed successfully")
            
            # Log success with summary
            add_to_log(f"✅ Move operation completed successfully", "green")
            add_to_log(f"From: {source_path}", "white")
            add_to_log(f"To: {new_path}", "white")
            add_to_log(f"Total files moved: {file_count}", "white")
        else:
            add_to_log(f"❌ Error submitting changes: {submit_result.stderr}", "red")

    except subprocess.CalledProcessError as e:
        add_to_log(f"❌ Error executing P4 command: {e.stderr}", "red")
    except Exception as e:
        add_to_log(f"❌ Error: {str(e)}", "red")
    finally:
        # Ensure progress window is closed
        if progress_window and progress_window.window.winfo_exists():
            progress_window.close()

def show_rename_move_dialog(selected_path):
    """Show dialog for rename/move operation"""
    # Get and validate inputs for constructing the full path
    workspace = workspace_var.get().strip()
    if not workspace:
        add_to_log("❌ Error: No workspace path selected", "red")
        return
        
    ue_version = ue_version_var.get().strip()
    distribution_method = distribution_method_var.get()
    app_name = app_name_var.get().strip()
    sf_case = sf_case_var.get().strip()
    
    # Validate inputs
    if not all([workspace, ue_version, distribution_method, app_name, sf_case]):
        add_to_log("❌ Error: All fields must be filled (Workspace, UE Version, Distribution Method, App Name, SF Case).", "red")
        return
        
    if not re.match(r'^\d+\.\d+$', ue_version):
        add_to_log("❌ Error: UE Version must be in the format 'X.Y' (e.g., 4.27 or 5.3).", "red")
        return
    
    # Determine UE content type based on version
    ue_content = "UE5-UserContent" if float(ue_version) >= 5.0 else "UE4-UserContent"
    
    # Construct source path using workspace
    source_path = os.path.join(workspace, ue_content, ue_version, distribution_method, app_name)
    
    if not os.path.exists(source_path):
        add_to_log(f"❌ Error: Path does not exist: {source_path}", "red")
        add_to_log("Please use 'Get Revision' first to sync the files.", "yellow")
        return

    dialog = tk.Toplevel(root)
    dialog.title("Rename/Move")
    dialog.geometry("500x250")
    dialog.transient(root)
    dialog.grab_set()
    
    # Center the window relative to main window
    dialog.geometry(f"+{root.winfo_x() + 100}+{root.winfo_y() + 100}")
    
    # Create frames for organization
    path_frame = ttk.LabelFrame(dialog, text="Selected Path")
    path_frame.pack(pady=10, padx=10, fill=tk.X)
    
    input_frame = ttk.LabelFrame(dialog, text="New Name/Location")
    input_frame.pack(pady=10, padx=10, fill=tk.X)
    
    button_frame = ttk.Frame(dialog)
    button_frame.pack(pady=10, fill=tk.X)
    
    # Show current path
    current_path_label = ttk.Label(path_frame, text=source_path, wraplength=450)
    current_path_label.pack(pady=5, padx=5)
    
    # New name input
    name_label = ttk.Label(input_frame, text="New Name:")
    name_label.pack(anchor=tk.W, padx=5, pady=2)
    
    name_entry = ttk.Entry(input_frame, width=50)
    name_entry.insert(0, os.path.basename(source_path))
    name_entry.pack(padx=5, pady=2)
    
    # New location input
    location_label = ttk.Label(input_frame, text="New Location (optional):")
    location_label.pack(anchor=tk.W, padx=5, pady=2)
    
    location_entry = ttk.Entry(input_frame, width=50)
    location_entry.insert(0, os.path.dirname(source_path))
    location_entry.pack(padx=5, pady=2)
    
    def on_submit():
        new_name = name_entry.get().strip()
        new_location = location_entry.get().strip()
        
        if not new_name:
            messagebox.showerror("Error", "New name cannot be empty")
            return
        
        dialog.destroy()
        
        # Create and show progress window
        progress_window = ProgressWindow(root, "Rename/Move Progress")
        progress_window.update_status("Initializing rename/move operation...")
        
        # Start the operation in a separate thread
        thread = threading.Thread(
            target=lambda: perform_rename_move(source_path, new_name, new_location, progress_window)
        )
        thread.daemon = True
        thread.start()
    
    def on_cancel():
        dialog.destroy()
    
    # Add Submit and Cancel buttons
    submit_btn = ttk.Button(button_frame, text="Submit", command=on_submit)
    submit_btn.pack(side=tk.LEFT, padx=5)
    
    cancel_btn = ttk.Button(button_frame, text="Cancel", command=on_cancel)
    cancel_btn.pack(side=tk.LEFT, padx=5)
    
    # Apply dark mode if enabled
    if dark_mode:
        dialog.configure(bg="#2E2E2E")
        for frame in [path_frame, input_frame, button_frame]:
            frame.configure(style='Dark.TFrame')
        current_path_label.configure(style='Dark.TLabel')
        name_label.configure(style='Dark.TLabel')
        location_label.configure(style='Dark.TLabel')

# Add this to your main UI creation code for the new button row
def create_rename_move_button():
    rename_move_frame = ttk.Frame(root)
    rename_move_frame.pack(pady=5, padx=10, fill=tk.X)
    
    rename_move_btn = ttk.Button(
        rename_move_frame,
        text="Rename/Move",
        command=lambda: show_rename_move_dialog(selected_path.get())
    )
    rename_move_btn.pack(side=tk.LEFT, padx=5)
    
    if dark_mode:
        rename_move_frame.configure(style='Dark.TFrame')


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
    """Load the saved workspace from config file if it exists."""
    if os.path.exists(config_file):
        with open(config_file, "r") as f:
            lines = f.readlines()
            if len(lines) > 0:
                workspace_var.set(lines[0].strip())
    # Apply the dark theme
    apply_theme()
    load_window_position()  # Load window position after applying theme

def save_workspace(workspace):
    """Save the workspace path and window position to config file."""
    with open(config_file, "w") as f:
        f.write(f"{workspace}\n{root.winfo_x()},{root.winfo_y()}")

def create_folder():
    # Get user inputs
    workspace = workspace_var.get()
    ue_version = ue_version_var.get().strip()
    distribution_method = distribution_method_var.get()
    app_name = app_name_var.get().strip()

    # Validate inputs
    if not workspace:
        add_to_log("Error: Please select a P4 workspace.", "red")
        return
    if not ue_version or not re.match(r'^\d+\.\d+$', ue_version):
        add_to_log("Error: UE Version must be in the format 'X.Y' (e.g., 4.10 or 5.0).", "red")
        return
    if not distribution_method:
        add_to_log("Error: Please select a distribution method.", "red")
        return
    if not app_name:
        add_to_log("Error: Please enter the App Name.", "red")
        return
    if " " in app_name:
        add_to_log("Error: App Name must not contain spaces.", "red")
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
        add_to_log(f"✅ Folder created and opened: {folder_path}", "green")
    except Exception as e:
        add_to_log(f"❌ Error: {str(e)}", "red")



def clear_fields():
    ue_version_var.set("")
    distribution_method_var.set("AssetPacks")  # Reset to default value
    app_name_var.set("")
    sf_case_var.set("")  # Clear SF case field
    output_label.config(text="")  # Clear the output label

def browse_workspace():
    folder_selected = filedialog.askdirectory(title="Select P4 Workspace")
    if folder_selected:
        workspace_var.set(folder_selected)
        save_workspace(folder_selected)  # Save the selected workspace and dark mode preference

def perform_clear_workspace():
    """Actual workspace clearing operation running in separate thread"""
    workspace = workspace_var.get()
    
    try:
        # Disable the Clear Workspace button during operation
        for widget in button_frame.winfo_children():
            if widget.cget('text') == "Clear Workspace":
                widget.config(state='disabled')

        # Define paths for UE4 and UE5 UserContent
        source1 = os.path.join(workspace, "UE4-UserContent")
        source2 = os.path.join(workspace, "UE5-UserContent")

        add_to_log("Starting workspace cleanup...", "white")
        start_loading_animation("Clearing workspace")

        def clear_second_level_directories(path):
            if os.path.exists(path):
                for first_level_dir in os.listdir(path):
                    first_level_path = os.path.join(path, first_level_dir)
                    if os.path.isdir(first_level_path):
                        for second_level_dir in os.listdir(first_level_path):
                            second_level_path = os.path.join(first_level_path, second_level_dir)
                            if os.path.isdir(second_level_path):
                                for root, dirs, files in os.walk(second_level_path, topdown=False):
                                    for name in files:
                                        file_path = os.path.join(root, name)
                                        try:
                                            os.chmod(file_path, 0o777)
                                            os.remove(file_path)
                                        except Exception as e:
                                            add_to_log(f"❌ Error deleting file {file_path}: {str(e)}", "red")
                                    for name in dirs:
                                        dir_path = os.path.join(root, name)
                                        try:
                                            shutil.rmtree(dir_path)
                                        except Exception as e:
                                            add_to_log(f"❌ Error deleting directory {dir_path}: {str(e)}", "red")

        # Clear contents in both directories
        clear_second_level_directories(source1)
        clear_second_level_directories(source2)

        # Stop loading animation before showing results
        stop_loading_animation()
        time.sleep(0.2)  # Small delay to ensure animation thread completes

        add_to_log(f"✅ Workspace cleared successfully", "green")

    except Exception as e:
        stop_loading_animation()
        add_to_log(f"❌ Error clearing workspace: {str(e)}", "red")
    finally:
        # Re-enable the Clear Workspace button
        for widget in button_frame.winfo_children():
            if widget.cget('text') == "Clear Workspace":
                widget.config(state='normal')
        add_to_log("════════════════════════", "white")

def clear_workspace():
    """Clear workspace with loading animation in separate thread"""
    global loading_thread, stop_loading
    
    workspace = workspace_var.get()
    if not workspace:
        add_to_log("❌ Error: No P4 workspace selected.", "red")
        return

    response = messagebox.askyesno(
        "Warning",
        "This will delete specific subdirectories in your P4V workspace.\n"
        "Make sure there are no pending changelists in P4V to be submitted.\n"
        "Are you sure you want to continue?"
    )

    if not response:
        return
    
    # Reset loading flag
    stop_loading = False
    
    # Start loading animation in separate thread
    loading_thread = threading.Thread(target=loading_animation)
    loading_thread.daemon = True
    loading_thread.start()
    
    # Start workspace clearing in separate thread
    clear_thread = threading.Thread(target=perform_clear_workspace)
    clear_thread.daemon = True
    clear_thread.start()

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
        
        # Add SF case handling
        sf_case = json_data.get("SFcase", "")
        sf_case_var.set(sf_case)
        
        add_to_log("Data loaded from clipboard.", "green")
    except json.JSONDecodeError:
        add_to_log("Wrong format received, you need to click 'P4V data' in the SF Helper", "red")
    except Exception as e:
        add_to_log(f"Error loading data: {str(e)}", "red")

# Apply the current theme based on dark_mode variable
def apply_theme():
    # Dark theme colors
    bg_color = "#2E2E2E"
    fg_color = "#FFFFFF"
    button_color = "#444444"
    entry_bg = "#3E3E3E"
    notebook_bg = "#1E1E1E"
    
    # Configure style for ttk widgets
    style = ttk.Style()
    style.configure('Dark.TLabelframe', background='#2E2E2E', foreground='white')
    style.configure('Dark.TLabelframe.Label', background='#2E2E2E', foreground='white')
    
    # Configure the notebook styles
    style.configure("TNotebook", background=bg_color, borderwidth=0)
    style.configure("TNotebook.Tab", background=button_color, foreground=button_color, padding=[10, 2])
    style.map("TNotebook.Tab",
             background=[("selected", "#4B0082")],
             foreground=[("selected", button_color)])
    
    # Configure the frame style specifically for the tab content
    style.configure("Tab.TFrame", background=notebook_bg)
    
    # Configure root
    root.config(bg=bg_color)
    
    def configure_widget(widget):
        try:
            widget_type = widget.winfo_class()
            
            # Special handling for "Get Data" button
            if widget_type == "Button" and widget.cget("text") == "Get Data":
                return
                
            if widget_type in ("Frame", "Label", "Button", "Entry", "Radiobutton", "Text"):
                if widget_type == "Frame":
                    widget.config(bg=bg_color)
                elif widget_type == "Button":
                    widget.config(bg=button_color, fg=fg_color)
                elif widget_type == "Entry":
                    widget.config(bg=entry_bg, fg=fg_color, insertbackground=fg_color)
                elif widget_type == "Radiobutton":
                    widget.config(bg=bg_color, fg=fg_color, selectcolor=entry_bg, activebackground=bg_color, activeforeground=fg_color)
                elif widget_type == "Label":
                    widget.config(bg=bg_color, fg=fg_color)
                elif widget_type == "Text":
                    widget.config(bg=notebook_bg, fg=fg_color, insertbackground=fg_color)
                    
            # Recursively configure children
            for child in widget.winfo_children():
                configure_widget(child)
                    
        except tk.TclError:
            pass
    
    # Apply configuration to all widgets
    configure_widget(root)
    
    # Special handling for specific widgets
    try:
        # Style the output text widget
        output_text.config(bg=notebook_bg, fg=fg_color)
        
        # Style the notebook and its content
        notebook.config(style="TNotebook")
        actions_log_tab.config(style="Tab.TFrame")  # Apply the dark background to the tab content
        
        # Update credits label
        credits_label.config(bg=bg_color, fg="#888888")
        
        # Style the right-click menu
        popup_menu.config(bg=entry_bg, fg=fg_color, activebackground="#4B0082", activeforeground=fg_color)
        
        # Update all frames
        button_frame.config(bg=bg_color)
        p4_actions_frame.config(bg=bg_color)
        output_frame.config(bg=bg_color)
        
    except Exception as e:
        print(f"Error applying theme to specific widgets: {e}")
            







#Starting the application / checking P4 connection splash screen
def create_loading_screen(parent):
    """Create loading message widgets in the main window"""
    loading_frame = tk.Frame(parent, bg="#2E2E2E")
    loading_frame.place(relx=0.5, rely=0.5, anchor="center")
    
    loading_text = tk.Label(
        loading_frame,
        text="Please wait, verifying P4 connection...",
        font=("Arial", 10),
        bg="#2E2E2E",
        fg="white"
    )
    loading_text.pack(pady=10)
    
    spinner_label = tk.Label(
        loading_frame,
        text="⣾",
        font=("Arial", 12),
        bg="#2E2E2E",
        fg="white"
    )
    spinner_label.pack()
    
    return loading_frame, spinner_label

def animate_spinner(spinner_label, index=0):
    """Animate the spinner"""
    spinner_chars = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]
    spinner_label.config(text=spinner_chars[index])
    next_index = (index + 1) % len(spinner_chars)
    return next_index







def set_window_icon():
    """Set up the window icon for both window and taskbar"""
    if getattr(sys, 'frozen', False):
        application_path = sys._MEIPASS
    else:
        application_path = os.path.dirname(os.path.abspath(__file__))

    icon_path = os.path.join(application_path, 'icon.ico')
    
    if os.path.exists(icon_path):
        if sys.platform.startswith('win'):
            try:
                # Set a very specific app ID
                app_id = 'Epic.ModSquad.P4VHelperPro.0.5.0'
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
                
                # Get the window handle
                hwnd = windll.user32.GetParent(root.winfo_id())
                
                # Load the icon for different sizes
                hinst = win32api.GetModuleHandle(None)
                
                icon_flags = win32con.LR_LOADFROMFILE | win32con.LR_DEFAULTSIZE
                
                # Load large icon (32x32)
                large_icon = win32gui.LoadImage(
                    hinst,
                    icon_path,
                    win32con.IMAGE_ICON,
                    32,
                    32,
                    icon_flags
                )
                
                # Load small icon (16x16)
                small_icon = win32gui.LoadImage(
                    hinst,
                    icon_path,
                    win32con.IMAGE_ICON,
                    16,
                    16,
                    icon_flags
                )
                
                # Set both icons
                win32gui.SendMessage(hwnd, win32con.WM_SETICON, win32con.ICON_BIG, large_icon)
                win32gui.SendMessage(hwnd, win32con.WM_SETICON, win32con.ICON_SMALL, small_icon)
                
                # Force taskbar icon update
                root.iconbitmap(default=icon_path)
                
                # Force Windows to refresh the icon cache for this application
                try:
                    import win32com.client
                    shell = win32com.client.Dispatch("WScript.Shell")
                    shortcut_path = os.path.join(shell.SpecialFolders("Programs"), "P4VHelper Pro.lnk")
                    if os.path.exists(shortcut_path):
                        shortcut = shell.CreateShortCut(shortcut_path)
                        shortcut.IconLocation = f"{icon_path},0"
                        shortcut.Save()
                except:
                    pass
                
            except Exception as e:
                print(f"Error setting Windows icon: {e}")
                # Fallback to basic icon
                try:
                    root.iconbitmap(icon_path)
                except:
                    pass
        else:
            # Non-Windows platforms
            try:
                root.iconbitmap(f'@{icon_path}')
            except:
                try:
                    root.iconbitmap(icon_path)
                except:
                    pass

    # Ensure the window is shown after icon setting
    root.deiconify()
    root.lift()
    root.update_idletasks()
  
if __name__ == "__main__":
    try:
        root = tk.Tk()
        root.title("P4Vhelper Pro v0.5.0")
        root.geometry("500x800")
        root.resizable(True, True)
        
        # Initialize global variables
        workspace_var = tk.StringVar()
        ue_version_var = tk.StringVar()
        distribution_method_var = tk.StringVar(value="AssetPacks") # AssetPacks selected by default
        app_name_var = tk.StringVar()
        sf_case_var = tk.StringVar() 
        
        # Add padding at the top
        tk.Label(root, text="").grid(row=0, column=0, pady=(10, 0))

        # Workspace selection
        tk.Label(root, text="P4 Workspace:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
        tk.Entry(root, textvariable=workspace_var, width=45).grid(row=1, column=1, padx=10, sticky="w")
        tk.Button(root, text="Browse", command=browse_workspace).grid(row=1, column=2, padx=10, sticky="e")

        # Get Data Button
        tk.Button(root, text="Get Data", command=get_data_from_clipboard, bg="#dbca09", fg="black").grid(row=2, column=1, padx=100, pady=5, sticky="w")


        # UE Version and SF Case (same row)
        tk.Label(root, text="UE Version (E.G: 4.27):").grid(row=3, column=0, padx=10, pady=5, sticky="w")
        tk.Entry(root, textvariable=ue_version_var, width=10).grid(row=3, column=1, padx=10, sticky="w")

        # Add SF Case label and entry
        tk.Label(root, text="SF Case:").grid(row=3, column=1, padx=(120, 0), pady=5, sticky="w")
        sf_case_entry = tk.Entry(root, textvariable=sf_case_var, width=10)
        sf_case_entry.grid(row=3, column=1, padx=(190, 0), sticky="w")



        validate_numeric = root.register(validate_numeric_input)
        sf_case_entry.config(validate="key", validatecommand=(validate_numeric, '%P'))

        # Distribution Method
        tk.Label(root, text="Distribution Method:").grid(row=4, column=0, padx=10, pady=5, sticky="w")
        methods = ["AssetPacks", "CompleteProjects", "Plugins"]
        for i, method in enumerate(methods):
            tk.Radiobutton(root, text=method, variable=distribution_method_var, value=method).grid(row=5 + i, column=1, padx=10, sticky="w")

        # App Name
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


        # Add new P4 actions frame before the output frame
        p4_actions_frame = tk.Frame(root)
        p4_actions_frame.grid(row=10, column=0, columnspan=3, pady=10)

        # Add the Get Revision button (leaving space for more)
        tk.Button(p4_actions_frame, 
                text="Get Revision", 
                command=lambda: get_revision(),
                bg="#4B0082", 
                fg="white",
                width=15).grid(row=0, column=0, padx=5)

        # Add Reconcile & Submit button (second position)
        tk.Button(p4_actions_frame, 
                text="Reconcile & Submit", 
                command=reconcile_submit,
                bg="#4B0082", 
                fg="white",
                width=15).grid(row=0, column=1, padx=5)

        # Add Find in Depot button (third position)
        tk.Button(p4_actions_frame,
                text="Find in Depot",
                command=find_in_depot,
                bg="#4B0082",
                fg="white",
                width=15).grid(row=0, column=2, padx=5)

        # Add P4 Conection button (fourth position)
        tk.Button(p4_actions_frame,
                text="P4 Connection",
                command=p4_connection_button_click,  # Use the new wrapper
                bg="#4B0082",
                fg="white",
                width=15).grid(row=0, column=3, padx=5)

        # Add a second row of P4 actions
        p4_additional_actions_frame = tk.Frame(root)
        p4_additional_actions_frame.grid(row=11, column=0, columnspan=3, pady=(0,10))

        # Add Rename/Move button
        tk.Button(p4_additional_actions_frame,
                text="Rename/Move",
                command=lambda: show_rename_move_dialog(None),
                bg="#4B0082",
                fg="white",
                width=15).grid(row=0, column=0, padx=5)

        #Second tab Change History

        def create_changes_tab(notebook):
            """Create the Changes History tab with a table view"""
            changes_tab = ttk.Frame(notebook, style="Tab.TFrame")
            notebook.add(changes_tab, text="Change History")
            
            # Create and configure a frame for the treeview
            tree_frame = ttk.Frame(changes_tab)
            tree_frame.pack(fill="both", expand=True, padx=5, pady=5)
            
            # Create Treeview for the table
            columns = ("Changelist", "Date", "Submitted by", "Description")
            tree = ttk.Treeview(tree_frame, columns=columns, show='headings')
            
            # Configure column headings and widths
            tree.column("Changelist", width=100, minwidth=100)
            tree.column("Date", width=150, minwidth=150)
            tree.column("Submitted by", width=150, minwidth=150)
            tree.column("Description", width=400, minwidth=200)
            
            for col in columns:
                tree.heading(col, text=col, anchor=tk.W)
            
            # Add scrollbars
            vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=tree.yview)
            hsb = ttk.Scrollbar(tree_frame, orient="horizontal", command=tree.xview)
            tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
            
            # Grid layout for tree and scrollbars
            tree.grid(row=0, column=0, sticky='nsew')
            vsb.grid(row=0, column=1, sticky='ns')
            hsb.grid(row=1, column=0, sticky='ew')
            
            # Configure grid weights
            tree_frame.grid_rowconfigure(0, weight=1)
            tree_frame.grid_columnconfigure(0, weight=1)
            
            def show_changelist_details(event):
                """Show details when a changelist is double-clicked"""
                selection = tree.selection()
                if not selection:
                    return
                    
                item = selection[0]
                changelist = tree.item(item)['values'][0]
                
                # Create details window
                details_window = tk.Toplevel(root)
                details_window.title(f"Changelist {changelist} Details")
                details_window.geometry("800x600")
                details_window.transient(root)
                
                # Center the window
                details_window.geometry(f"+{root.winfo_x() + 50}+{root.winfo_y() + 50}")
                
                # Create text widget with scrollbar
                text_frame = ttk.Frame(details_window)
                text_frame.pack(fill="both", expand=True, padx=5, pady=5)
                
                text_widget = tk.Text(text_frame, wrap=tk.NONE)
                vsb = ttk.Scrollbar(text_frame, orient="vertical", command=text_widget.yview)
                hsb = ttk.Scrollbar(text_frame, orient="horizontal", command=text_widget.xview)
                text_widget.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
                
                # Pack layout
                text_widget.pack(side="left", fill="both", expand=True)
                vsb.pack(side="right", fill="y")
                hsb.pack(side="bottom", fill="x")
                
                # Add loading indicator
                text_widget.insert(tk.END, "Loading changelist details...")
                text_widget.update()
                
                try:
                    # Get changelist details using p4 describe
                    result = subprocess.run(['p4', 'describe', str(changelist)],
                                        capture_output=True,
                                        text=True,
                                        check=True,
                                        startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
                    
                    # Clear loading message
                    text_widget.delete('1.0', tk.END)
                    
                    if result.returncode == 0:
                        details = result.stdout
                        text_widget.insert(tk.END, details)
                        text_widget.configure(state='disabled')
                        
                        if dark_mode:
                            details_window.configure(bg="#2E2E2E")
                            text_widget.configure(bg="#1E1E1E", fg="white")
                    else:
                        text_widget.insert(tk.END, f"Error getting changelist details: {result.stderr}")
                        
                except subprocess.CalledProcessError as e:
                    text_widget.delete('1.0', tk.END)
                    text_widget.insert(tk.END, f"Error: {str(e)}")
            
            def get_p4_username():
                """Get the current P4 username with enhanced error handling"""
                try:
                    result = subprocess.run(['p4', 'info'],
                                        capture_output=True,
                                        text=True,
                                        check=True,
                                        startupinfo=subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW))
                    
                    if result.returncode == 0:
                        # Parse the output looking for "User name: "
                        for line in result.stdout.splitlines():
                            if line.startswith('User name:'):
                                return line.split('User name:')[1].strip()
                except subprocess.CalledProcessError as e:
                    # Create error window
                    error_window = tk.Toplevel(root)
                    error_window.title("P4 Connection Error")
                    error_window.geometry("400x200")
                    error_window.transient(root)
                    error_window.grab_set()
                    
                    # Center the window relative to main window
                    error_window.geometry(f"+{root.winfo_x() + 100}+{root.winfo_y() + 100}")
                    
                    # Create frame for message
                    message_frame = ttk.Frame(error_window)
                    message_frame.pack(expand=True, fill='both', padx=20, pady=20)
                    
                    # Error message
                    error_msg = ttk.Label(message_frame, 
                                        text="Unable to connect to P4 server.\n\n"
                                            f"Error: {e.stderr.strip()}\n\n"
                                            "Hint: Check that your VPN is on.",
                                        wraplength=350,
                                        justify='center')
                    error_msg.pack(pady=10)
                    
                    # OK button
                    ok_button = ttk.Button(message_frame, 
                                        text="OK", 
                                        command=error_window.destroy,
                                        width=10)
                    ok_button.pack(pady=10)
                    
                    # Apply theme
                    if dark_mode:
                        error_window.configure(bg="#2E2E2E")
                        message_frame.configure(style='Dark.TFrame')
                        error_msg.configure(style='Dark.TLabel')
                    
                    add_to_log(f"❌ Error getting P4 username: {str(e)}", "red")
                    add_to_log(f"⚠️ Hint: Check that your VPN is on", "yellow")
                    return None
                except Exception as e:
                    add_to_log(f"❌ Unexpected error: {str(e)}", "red")
                    return None
            
            def refresh_changes():
                """Refresh the changes list"""
                refresh_btn.configure(state='disabled')
                refresh_btn.update()
                
                for item in tree.get_children():
                    tree.delete(item)
                
                loading_item = tree.insert('', 0, values=('Loading...', '', '', ''))
                tree.update()
                
                try:   
                    p4_username = get_p4_username()
                    if not p4_username:
                        raise Exception("Could not determine P4 username")
                    
                    # Create startupinfo to hide windows
                    startupinfo = None
                    if sys.platform == "win32":
                        startupinfo = subprocess.STARTUPINFO()
                        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                        startupinfo.wShowWindow = subprocess.SW_HIDE

                    # Define the command
                    cmd = ['p4', 'changes', '-s', 'submitted', '-l', '-m', '100', '-u', p4_username, '//depot/...']
                    add_to_log(f"Executing command: {' '.join(cmd)}", "white")
                    
                    result = subprocess.run(cmd,
                                        capture_output=True,
                                        text=True,
                                        check=True,
                                        startupinfo=startupinfo)
                        
                    tree.delete(loading_item)
                    
                    if result.returncode == 0 and result.stdout.strip():
                        lines = result.stdout.splitlines()
                        changes = []  # Store changes temporarily
                        i = 0
                        
                        while i < len(lines):
                            current_line = lines[i].strip()
                            
                            if current_line.startswith('Change '):
                                try:
                                    parts = current_line.split()
                                    
                                    if len(parts) >= 6:
                                        changelist = parts[1]
                                        date = parts[3]
                                        user = parts[5].split('@')[0]
                                        
                                        # Get description from next non-empty line
                                        description = ""
                                        next_line_index = i + 1
                                        while next_line_index < len(lines):
                                            next_line = lines[next_line_index].strip()
                                            if next_line and not next_line.startswith('Change '):
                                                description = next_line
                                                break
                                            next_line_index += 1
                                        
                                        # Add to our temporary list instead of inserting directly
                                        changes.append((changelist, date, user, description))
                                        i = next_line_index + 1
                                    else:
                                        i += 1
                                except Exception as parse_error:
                                    add_to_log(f"Error parsing change entry: {str(parse_error)}", "red")
                                    i += 1
                            else:
                                i += 1
                        
                        # Sort changes by changelist number (newest first)
                        changes.sort(key=lambda x: int(x[0]), reverse=True)
                        
                        # Insert all changes into the tree
                        for change in changes:
                            tree.insert('', 'end', values=change)
                        
                        if not tree.get_children():
                            tree.insert('', 'end', values=('No changes found', '', '', ''))
                            
                except subprocess.CalledProcessError as e:
                    tree.delete(loading_item)
                    error_msg = f"Error loading changes: {str(e)}"
                    add_to_log(f"CalledProcessError: {str(e)}", "red")
                    add_to_log(f"Error output: {e.stderr}", "red")
                    tree.insert('', 'end', values=('Error', '', '', error_msg))
                except Exception as e:
                    tree.delete(loading_item)
                    error_msg = f"Unexpected error: {str(e)}"
                    add_to_log(f"Exception: {str(e)}", "red")
                    tree.insert('', 'end', values=('Error', '', '', error_msg))
                finally:
                    refresh_btn.configure(state='normal')
            
            # Bind double-click event
            tree.bind('<Double-1>', show_changelist_details)
            
            # Add refresh button at the bottom
            refresh_frame = ttk.Frame(changes_tab)
            refresh_frame.pack(fill="x", padx=5, pady=5)
            
            refresh_btn = ttk.Button(refresh_frame, text="Refresh", command=refresh_changes)
            refresh_btn.pack(side="right")
            
            # Add tab selection handler
            def on_tab_selected(event):
                selected_tab = event.widget.select()
                tab_text = event.widget.tab(selected_tab, "text")
                if tab_text == "Change History" and not tree.get_children():
                    refresh_changes()
            
            notebook.bind('<<NotebookTabChanged>>', on_tab_selected)
            
            return changes_tab

        # Create notebook (tabbed interface)
        notebook = ttk.Notebook(root)
        notebook.grid(row=12, column=0, columnspan=3, pady=10, sticky="nsew")

        # First tab for Actions Log
        actions_log_tab = ttk.Frame(notebook, style="Tab.TFrame")
        notebook.add(actions_log_tab, text="Actions Log")

        # Create output text widget with scrollbar
        output_frame = tk.Frame(actions_log_tab)  # Changed parent to actions_log_tab
        output_frame.pack(fill="both", expand=True, padx=5, pady=5)  # Using pack instead of grid for the frame

        # Configure grid weights to make the output frame expandable
        root.grid_rowconfigure(12, weight=1)
        root.grid_columnconfigure(1, weight=1)

        # Create scrollbar
        scrollbar = tk.Scrollbar(output_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)




        # Create text widget
        output_text = tk.Text(output_frame, 
                            height=8,
                            width=50,
                            yscrollcommand=scrollbar.set,
                            wrap=tk.WORD,
                            font=("Consolas", 9))
        output_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=output_text.yview)

        # Configure text widget
        output_text.configure(state='disabled')  # Make it read-only
        output_text.tag_config('color_red', foreground='red')
        output_text.tag_config('color_green', foreground='green')
        output_text.tag_config('color_blue', foreground='blue')
        output_text.tag_config('color_white', foreground='white')
        output_text.tag_config('color_yellow', foreground='yellow')

        # Add right-click menu for copying
        def copy_selected_text():
            try:
                selected_text = output_text.get(tk.SEL_FIRST, tk.SEL_LAST)
                root.clipboard_clear()
                root.clipboard_append(selected_text)
            except tk.TclError:  # No selection
                pass

        def show_popup_menu(event):
            try:
                popup_menu.tk_popup(event.x_root, event.y_root, 0)
            finally:
                popup_menu.grab_release()

        popup_menu = tk.Menu(output_text, tearoff=0)
        popup_menu.add_command(label="Copy", command=copy_selected_text)
        output_text.bind("<Button-3>", show_popup_menu)



        # Add the Changes History tab
        changes_tab = create_changes_tab(notebook)



        # Author Credits
        credits_text = "Minitool created for Modsquad Epic MKTP, DM me on Slack for any bug report / Ideas - Oscar O."
        credits_label = tk.Label(root, text=credits_text, font=("Arial", 8), fg="gray", wraplength=350, justify="center")
        credits_label.grid(row=13, column=0, columnspan=3, pady=10)
        
        # Check for P4 installation before proceeding
        if not check_p4_installed():
            root.withdraw()  # Hide main window
            show_p4_installation_dialog()
        else:
            # Load saved workspace
            load_workspace()
            
            # Initialize with threaded P4 check
            initialize_with_details()
            
            # Set the window icon
            set_window_icon()
            
            # Bind window close event
            root.protocol("WM_DELETE_WINDOW", lambda: [save_window_position(), root.destroy()])
            
        # Run the main loop (still inside the if __name__ == "__main__": block)
        root.mainloop()
    finally:
        cleanup_temp_files()