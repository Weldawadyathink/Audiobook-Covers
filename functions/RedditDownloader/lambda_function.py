import subprocess
import os
import sys

def lambda_handler(event, context):
    include_id = "192mt7x"
    include_file = "/tmp/include-id.txt"
    with open(include_file, "w+") as f:
        f.write(include_id)
        
    add_to_path_command = "export PATH=$PATH:/opt/python/lib/python3.11/site-packages"
    # print(f"Python executable is {sys.executable}")
    # print(f"System path is {sys.path}")
    # print(os.listdir('/opt/python/lib/python3.11/site-packages'))
    # print(os.listdir('/opt/python/lib/python3.11/site-packages/bdfr'))
    # subprocess.run([sys.executable,'-c','import sys; print(sys.path)'])
    sys.path.append(add_to_path_command)
    subprocess.run(f"{sys.executable} -m bdfr download /tmp --include-id-file {include_file} --file-scheme {{POSTID}}".split(" "))
    print(os.listdir('/tmp'))

if __name__ == '__main__':
    pass