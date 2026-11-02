from django.conf import settings
from django.db import models

class ShopProfile(models.Model):
    key = models.CharField(max_length=270, primary_key=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    seller = models.CharField(max_length=160)
    verified_until = models.DateTimeField()
    banner = models.CharField(max_length=40, blank=True)
    gallery = models.JSONField(default=list)
    featured = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)
    disabled = models.BooleanField(default=False)

class Challenge(models.Model):
    id = models.CharField(max_length=48, primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    shop_key = models.CharField(max_length=270)
    seller = models.CharField(max_length=160)
    item_name = models.CharField(max_length=160)
    template = models.CharField(max_length=160)
    material = models.CharField(max_length=60)
    category = models.CharField(max_length=60)
    price = models.PositiveIntegerField()
    prior_ids = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    state = models.CharField(max_length=16, default='pending')
    requested_at = models.DateTimeField(null=True)
    checked_at = models.DateTimeField(null=True)
    attempts = models.PositiveIntegerField(default=0)
    matched_listing = models.CharField(max_length=128, blank=True)

class UsedProof(models.Model):
    listing = models.CharField(max_length=128, primary_key=True)
    used_at = models.DateTimeField(auto_now_add=True)

class LimitBucket(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField()

class Audit(models.Model):
    at = models.DateTimeField(auto_now_add=True)
    action = models.CharField(max_length=32)
    shop_key = models.CharField(max_length=270, blank=True)
    user_id_value = models.PositiveIntegerField(null=True)
