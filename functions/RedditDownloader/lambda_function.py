import subprocess
import os
import sys
import shutil

def lambda_handler(event, context):
    # subprocess.run("rm -rf /tmp/*".split(" "))
    
    include_id = "192mt7x"
    include_file = "/tmp/include-id.txt"
    subprocess.run("ls -a /opt/".split(" "))
    subprocess.run("mkdir -p /tmp/site-packages/bdfr".split(" "))
    subprocess.run("cp -r /opt/bdfr /tmp/site-packages/".split(" "))
    subprocess.run("ls -a /tmp/site-packages".split(" "))
    with open(include_file, "w+") as f:
        f.write(include_id)
    subprocess.run(f"{sys.executable} -m bdfr download /tmp --config /tmp/config.cfg --include-id-file {include_file} --file-scheme {{POSTID}}".split(" "), shell=True)
    print(os.listdir('/tmp'))

def prepare_bdfr():
    source_folder = '/opt/bdfr'
    destination_folder = '/tmp/site-packages'
    if os.path.exists(destination_folder):
        print(f"{destination_folder} already exists. Exiting.")
    else:
        shutil.copytree(source_folder, destination_folder)
        print(f"Copied {source_folder} to {destination_folder}.")

if __name__ == '__main__':
    lambda_handler(None, None)