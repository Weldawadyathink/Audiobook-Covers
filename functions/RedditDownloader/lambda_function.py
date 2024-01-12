import subprocess
import os
import sys
import shutil

include_file = "/tmp/include-id.txt"
download_folder = "/tmp/downloads"
bdfr_base_folder = '/opt/bdfr'
bdfr_run_folder = '/tmp/site-packages'

def lambda_handler(event, context):
    prepare_environment()
    
    include_id = "192mt7x"
    with open(include_file, "w+") as f:
        f.write(include_id)
    print(subprocess.run(f"{sys.executable} -m bdfr download /tmp/downloads --include-id-file {include_file} --file-scheme {{POSTID}}".split(" "), shell=True, capture_output=True))
    print(os.listdir("/tmp/downloads"))

def prepare_environment():
    if os.path.exists(bdfr_run_folder):
        print(f"{bdfr_run_folder} already exists.")
    else:
        shutil.copytree(bdfr_base_folder, bdfr_run_folder)
        print(f"Copied {bdfr_base_folder} to {bdfr_run_folder}.")
    
    if os.path.exists(include_file):
        os.remove(include_file)
        print(f"Deleted {include_file}")
    
    if os.path.exists(download_folder):
        for filename in os.listdir(download_folder):
            file_path = os.path.join(download_folder, filename)
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
                if os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                raise Exception(f'Failed to delete {file_path}. Reason: {e}')
        print(f"All contents of {download_folder} have been deleted.")
    else:
        os.makedirs(download_folder)
    

if __name__ == '__main__':
    lambda_handler(None, None)