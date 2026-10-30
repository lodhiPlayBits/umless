# mysqldump from the same MySQL version as HeatWave (8.4), plus the OCI SDK to upload.
FROM mysql:8.4

RUN microdnf install -y python3 python3-pip && microdnf clean all \
    && pip3 install --no-cache-dir oci==2.189.0

WORKDIR /backup
COPY backup.py .

RUN useradd --system --uid 10002 backup
USER backup

# Not the mysql image's server entrypoint: this container only runs the backup loop.
ENTRYPOINT ["python3", "backup.py"]
CMD ["run"]
